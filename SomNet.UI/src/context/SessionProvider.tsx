import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  startSession as startSessionApi,
  endSession as endSessionApi,
  updateSession as updateSessionApi,
  patchSessionMode as patchSessionModeApi,
  discardInProgressSession as discardInProgressSessionApi,
} from '@/api/sessions';
import { useAuth } from '@/context/AuthProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import type { SubTargetName } from '@/config/sessionUsers';
import { sessionDeviceKey } from '@/utils/sessionDeviceKey';
import { activeSessionForSubAndDevice } from '@/utils/sessionForSub';
import type { OperationMode } from '@/types/modes';
import {
  buildAutomaticSessionSummary,
  buildManualSessionSummary,
  type ManualActionEvent,
  type ManualSessionEndReason,
} from '@/utils/sessionSummary';
import type { AutomaticResultJson } from '@/utils/automaticResultJson';
import type { SessionHistoryEntry } from '@/types/sessionHistory';
import { parseManualInProgressSummary } from '@/utils/manualSessionRehydrate';
import { isRehydratableManualSession } from '@/utils/sessionProgress';
import { markManualVideoCommandComplete } from '@/utils/manualVideoCommandNotify';
import { getTabId, postTabSync, shouldBroadcastLocalChange } from '@/utils/tabSync';
interface ActiveSessionState {
  id: string;
  startedAt: string;
  mode: OperationMode;
  subTarget: SubTargetName;
  deviceId: string;
  events: ManualActionEvent[];
  abortCount: number;
  /** True after Automatic Start succeeds for this scene session. */
  automaticDeviceStarted: boolean;
}

export interface EndSessionForAccessoryOptions {
  automaticDeviceStarted: boolean;
  automaticDeviceResult?: AutomaticResultJson | null;
}

interface SessionContextValue {
  activeSession: ActiveSessionState | null;
  /** Incremented when a manual stroke/burst/abort completes or manual session rehydrates (video idle timer). */
  manualVideoActivitySeq: number;
  /** Incremented on manual session rehydrate (refresh / tab sync); survives hook remount. */
  manualVideoRehydrateSeq: number;
  beginAutomaticSession: () => Promise<void>;
  recordManualStroke: (powerPercent: number, actualStrokeMs?: number) => Promise<void>;
  recordManualAbort: () => Promise<void>;
  recordManualBurst: (
    powerPercent: number,
    burstStrokes: number,
    burstDelaySeconds: number,
    strokesCompleted?: number,
  ) => Promise<void>;
  endManualSession: (reason: ManualSessionEndReason) => Promise<void>;
  endAutomaticSession: (
    reason: string,
    deviceResult?: AutomaticResultJson | null,
  ) => Promise<void>;
  endActiveSessionIfNeeded: (reason: ManualSessionEndReason | string) => Promise<void>;
  rehydrateSession: (entry: SessionHistoryEntry) => void;
  syncSessionFromRemote: (entry: SessionHistoryEntry | null, deviceIdForClear?: string) => void;
  /** Ensures an in-progress manual session exists (for video preview before first stroke). */
  /** Returns the action index to use for the next manual stroke/burst snapshot. */
  prepareManualSession: () => Promise<number>;
  /** Ensures an in-progress automatic session record exists (for video preview before Start). */
  prepareAutomaticSession: () => Promise<void>;
  /** V2 — new server row when scene session turns on for a device. */
  startSessionForAccessory: (mode: OperationMode, deviceId: string) => Promise<void>;
  endSessionForAccessory: (options: EndSessionForAccessoryOptions) => Promise<void>;
  syncActiveSessionMode: (mode: OperationMode) => Promise<void>;
  markAutomaticDeviceStarted: () => void;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const { selectedDeviceId } = useSubDevice();
  const [sessionsByKey, setSessionsByKey] = useState<Record<string, ActiveSessionState>>({});
  const [manualVideoActivitySeq, setManualVideoActivitySeq] = useState(0);
  const [manualVideoRehydrateSeq, setManualVideoRehydrateSeq] = useState(0);
  const sessionsByKeyRef = useRef(sessionsByKey);
  const activeSessionRef = useRef<ActiveSessionState | null>(null);
  const startingRef = useRef<Record<string, boolean>>({});

  sessionsByKeyRef.current = sessionsByKey;

  const activeSession = useMemo(() => {
    if (!selectedDeviceId) {
      return null;
    }
    return sessionsByKey[sessionDeviceKey(selectedSub, selectedDeviceId)] ?? null;
  }, [selectedDeviceId, selectedSub, sessionsByKey]);

  useEffect(() => {
    activeSessionRef.current = activeSession;
  }, [activeSession]);

  const setSessionForDevice = useCallback(
    (subTarget: SubTargetName, deviceId: string, session: ActiveSessionState | null) => {
      const key = sessionDeviceKey(subTarget, deviceId);
      setSessionsByKey((prev) => {
        if (!session) {
          if (!(key in prev)) {
            return prev;
          }
          const { [key]: _removed, ...rest } = prev;
          return rest;
        }
        return { ...prev, [key]: session };
      });
    },
    [],
  );

  const bumpManualVideoActivity = useCallback(() => {
    setManualVideoActivitySeq((seq) => seq + 1);
  }, []);

  const bumpManualVideoRehydrate = useCallback(() => {
    setManualVideoRehydrateSeq((seq) => seq + 1);
  }, []);

  const domTarget = user?.displayName ?? user?.username ?? '';

  const buildManualSummary = useCallback(
    (session: ActiveSessionState, abortCount = session.abortCount, inProgress = false) => {
      return buildManualSessionSummary({
        events: session.events,
        abortCount,
        inProgress,
      });
    },
    [],
  );

  const persistManualProgress = useCallback(
    async (session: ActiveSessionState, abortCount = session.abortCount) => {
      const summary = buildManualSummary(session, abortCount, true);
      await updateSessionApi(session.id, summary);
    },
    [buildManualSummary],
  );

  const buildSessionFromEntry = useCallback((entry: SessionHistoryEntry): ActiveSessionState => {
    const manualProgress =
      entry.mode === 'manual' ? parseManualInProgressSummary(entry.summary) : null;

    return {
      id: entry.id,
      startedAt: entry.startedAt,
      mode: entry.mode,
      subTarget: entry.subTarget,
      deviceId: entry.deviceId ?? selectedDeviceId ?? '',
      events: manualProgress?.events ?? [],
      abortCount: manualProgress?.abortCount ?? 0,
      automaticDeviceStarted: false,
    };
  }, [selectedDeviceId]);

  const startSessionForAccessory = useCallback(
    async (mode: OperationMode, deviceId: string) => {
      if (!domTarget) {
        throw new Error('Not signed in.');
      }

      if (!deviceId) {
        throw new Error('Select a device before starting a scene session.');
      }

      const key = sessionDeviceKey(selectedSub, deviceId);
      const existing = sessionsByKeyRef.current[key];
      if (existing) {
        if (existing.mode !== mode) {
          await patchSessionModeApi(existing.id, mode);
          const nextSession: ActiveSessionState = { ...existing, mode };
          setSessionForDevice(selectedSub, deviceId, nextSession);
        }
        return;
      }

      if (startingRef.current[key]) {
        throw new Error('Session start already in progress.');
      }

      startingRef.current[key] = true;

      try {
        const entry = await startSessionApi(selectedSub, deviceId, mode);
        const nextSession: ActiveSessionState = {
          id: entry.id,
          startedAt: entry.startedAt,
          mode,
          subTarget: selectedSub,
          deviceId,
          events: [],
          abortCount: 0,
          automaticDeviceStarted: false,
        };
        setSessionForDevice(selectedSub, deviceId, nextSession);
      } finally {
        startingRef.current[key] = false;
      }
    },
    [domTarget, selectedSub, setSessionForDevice],
  );

  const markAutomaticDeviceStarted = useCallback(() => {
    const current = activeSessionRef.current;
    if (!current || current.automaticDeviceStarted) {
      return;
    }

    const nextSession: ActiveSessionState = { ...current, automaticDeviceStarted: true };
    setSessionForDevice(current.subTarget, current.deviceId, nextSession);
  }, [setSessionForDevice]);

  const syncActiveSessionMode = useCallback(
    async (mode: OperationMode) => {
      const current = activeSessionRef.current;
      if (!current || current.mode === mode) {
        return;
      }

      await patchSessionModeApi(current.id, mode);
      const nextSession: ActiveSessionState = { ...current, mode };
      setSessionForDevice(current.subTarget, current.deviceId, nextSession);
    },
    [setSessionForDevice],
  );

  const prepareManualSession = useCallback(async (): Promise<number> => {
    const current = activeSessionRef.current;
    if (!current || current.mode !== 'manual') {
      throw new Error('Session in Progress must be on before manual actions.');
    }

    return current.events.length;
  }, []);

  const finalizeSession = useCallback(async (summary: string) => {
    const current = activeSessionRef.current;
    if (!current) {
      return;
    }

    try {
      await endSessionApi(current.id, summary);
      setSessionForDevice(current.subTarget, current.deviceId, null);
    } catch {
      // Keep activeSession so Stop/retry or rehydration can finish the server record.
    }
  }, [setSessionForDevice]);

  const beginAutomaticSession = useCallback(async () => {
    const current = activeSessionRef.current;
    if (!current || current.mode !== 'automatic') {
      return;
    }
  }, []);

  const recordManualStroke = useCallback(
    async (powerPercent: number, actualStrokeMs?: number) => {
      const current = activeSessionRef.current;
      if (!current || current.mode !== 'manual') {
        return;
      }

      const nextSession: ActiveSessionState = {
        ...current,
        events: [...current.events, { type: 'stroke', powerPercent, actualStrokeMs }],
      };
      setSessionForDevice(current.subTarget, current.deviceId, nextSession);
      bumpManualVideoActivity();
      markManualVideoCommandComplete();
      await persistManualProgress(nextSession);
    },
    [bumpManualVideoActivity, persistManualProgress, setSessionForDevice],
  );

  const recordManualAbort = useCallback(async () => {
    const current = activeSessionRef.current;
    if (!current || current.mode !== 'manual') {
      return;
    }

    const nextSession: ActiveSessionState = {
      ...current,
      abortCount: current.abortCount + 1,
    };
    setSessionForDevice(current.subTarget, current.deviceId, nextSession);
    bumpManualVideoActivity();
    markManualVideoCommandComplete();
    await persistManualProgress(nextSession);
  }, [bumpManualVideoActivity, persistManualProgress, setSessionForDevice]);

  const recordManualBurst = useCallback(
    async (
      powerPercent: number,
      burstStrokes: number,
      burstDelaySeconds: number,
      strokesCompleted?: number,
    ) => {
      const current = activeSessionRef.current;
      if (!current || current.mode !== 'manual') {
        return;
      }

      const completedStrokes = strokesCompleted ?? burstStrokes;

      const nextSession: ActiveSessionState = {
        ...current,
        events: [
          ...current.events,
          { type: 'burst', powerPercent, burstStrokes: completedStrokes, burstDelaySeconds },
        ],
      };
      setSessionForDevice(current.subTarget, current.deviceId, nextSession);
      bumpManualVideoActivity();
      markManualVideoCommandComplete();
      await persistManualProgress(nextSession);
    },
    [bumpManualVideoActivity, persistManualProgress, setSessionForDevice],
  );

  const endManualSession = useCallback(
    async (reason: ManualSessionEndReason) => {
      const current = activeSessionRef.current;
      if (!current || current.mode !== 'manual') {
        return;
      }

      const abortCount = reason === 'abort' ? current.abortCount + 1 : current.abortCount;
      const summary = buildManualSummary(current, abortCount, false);

      await finalizeSession(summary);
    },
    [buildManualSummary, finalizeSession],
  );

  const endAutomaticSession = useCallback(
    async (reason: string, deviceResult?: AutomaticResultJson | null) => {
      const current = activeSessionRef.current;
      if (!current || current.mode !== 'automatic') {
        return;
      }

      const automaticSummary = buildAutomaticSessionSummary(deviceResult ?? null, reason);
      const hasManualActivity = current.events.length > 0 || current.abortCount > 0;
      const summary = hasManualActivity
        ? `${buildManualSummary(current, current.abortCount, false).replace(/\.$/, '')}; ${automaticSummary}`
        : automaticSummary;
      await finalizeSession(summary);
    },
    [buildManualSummary, finalizeSession],
  );

  const rehydrateSession = useCallback(
    (entry: SessionHistoryEntry) => {
      const deviceId = entry.deviceId ?? selectedDeviceId;
      if (!deviceId) {
        return;
      }

      const key = sessionDeviceKey(entry.subTarget, deviceId);
      if (sessionsByKeyRef.current[key] || startingRef.current[key]) {
        return;
      }

      const nextSession = buildSessionFromEntry(entry);
      setSessionForDevice(entry.subTarget, deviceId, nextSession);
      if (isRehydratableManualSession(entry)) {
        bumpManualVideoActivity();
        bumpManualVideoRehydrate();
      }
    },
    [
      buildSessionFromEntry,
      bumpManualVideoActivity,
      bumpManualVideoRehydrate,
      selectedDeviceId,
      setSessionForDevice,
    ],
  );

  const syncSessionFromRemote = useCallback(
    (entry: SessionHistoryEntry | null, deviceIdForClear?: string) => {
      if (entry === null) {
        const deviceId = deviceIdForClear ?? selectedDeviceId;
        if (deviceId) {
          setSessionForDevice(selectedSub, deviceId, null);
        }
        return;
      }

      const deviceId = entry.deviceId ?? selectedDeviceId;
      if (!deviceId) {
        return;
      }

      const nextSession = buildSessionFromEntry(entry);
      const key = sessionDeviceKey(entry.subTarget, deviceId);
      const existing = sessionsByKeyRef.current[key];

      if (existing?.id === entry.id) {
        setSessionForDevice(entry.subTarget, deviceId, nextSession);
        return;
      }

      if (isRehydratableManualSession(entry) && !existing) {
        bumpManualVideoRehydrate();
      }

      setSessionForDevice(entry.subTarget, deviceId, nextSession);
    },
    [buildSessionFromEntry, bumpManualVideoRehydrate, selectedDeviceId, selectedSub, setSessionForDevice],
  );

  useEffect(() => {
    if (!shouldBroadcastLocalChange()) {
      return;
    }

    postTabSync({
      type: 'session',
      tabId: getTabId(),
      session: activeSession
        ? {
            id: activeSession.id,
            startedAt: activeSession.startedAt,
            mode: activeSession.mode,
            subTarget: activeSession.subTarget,
            deviceId: activeSession.deviceId,
          }
        : null,
    });
  }, [activeSession]);

  const endActiveSessionIfNeeded = useCallback(
    async (reason: ManualSessionEndReason | string) => {
      const current = activeSessionRef.current;
      if (!current) {
        return;
      }

      if (current.mode === 'manual') {
        const manualReason =
          reason === 'abort' ||
          reason === 'mode-switch' ||
          reason === 'sign-out' ||
          reason === 'sub-change' ||
          reason === 'session-accessory-off'
            ? reason
            : 'mode-switch';
        await endManualSession(manualReason);
        return;
      }

      const automaticReason =
        typeof reason === 'string' && reason.length > 0 ? reason : 'stopped manually';
      await endAutomaticSession(automaticReason);
    },
    [endAutomaticSession, endManualSession],
  );

  const discardActiveSession = useCallback(async () => {
    const current = activeSessionRef.current;
    if (!current) {
      return;
    }

    try {
      await discardInProgressSessionApi(current.id);
      setSessionForDevice(current.subTarget, current.deviceId, null);
    } catch {
      // Row may have progressed — fall back to a normal end below.
      await endActiveSessionIfNeeded('session-accessory-off');
    }
  }, [endActiveSessionIfNeeded, setSessionForDevice]);

  const endSessionForAccessory = useCallback(
    async (options: EndSessionForAccessoryOptions) => {
      const current = activeSessionRef.current;
      if (!current) {
        return;
      }

      const discardManual =
        current.mode === 'manual' && current.events.length === 0 && current.abortCount === 0;
      const discardAutomatic = current.mode === 'automatic' && !options.automaticDeviceStarted;

      if (discardManual || discardAutomatic) {
        await discardActiveSession();
        return;
      }

      if (current.mode === 'automatic') {
        await endAutomaticSession('session-accessory-off', options.automaticDeviceResult ?? null);
        return;
      }

      await endActiveSessionIfNeeded('session-accessory-off');
    },
    [discardActiveSession, endActiveSessionIfNeeded, endAutomaticSession],
  );

  const activeSessionForSelectedSub = useMemo(
    () => activeSessionForSubAndDevice(activeSession, selectedSub, selectedDeviceId),
    [activeSession, selectedDeviceId, selectedSub],
  );

  const value = useMemo(
    () => ({
      activeSession: activeSessionForSelectedSub,
      manualVideoActivitySeq,
      manualVideoRehydrateSeq,
      beginAutomaticSession,
      recordManualStroke,
      recordManualAbort,
      recordManualBurst,
      endManualSession,
      endAutomaticSession,
      endActiveSessionIfNeeded,
      rehydrateSession,
      syncSessionFromRemote,
      prepareManualSession,
      prepareAutomaticSession: beginAutomaticSession,
      startSessionForAccessory,
      endSessionForAccessory,
      syncActiveSessionMode,
      markAutomaticDeviceStarted,
    }),
    [
      activeSessionForSelectedSub,
      manualVideoActivitySeq,
      manualVideoRehydrateSeq,
      beginAutomaticSession,
      endActiveSessionIfNeeded,
      endAutomaticSession,
      endManualSession,
      endSessionForAccessory,
      prepareManualSession,
      rehydrateSession,
      syncSessionFromRemote,
      syncActiveSessionMode,
      startSessionForAccessory,
      markAutomaticDeviceStarted,
      recordManualBurst,
      recordManualStroke,
      recordManualAbort,
    ],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useLiveSession(): SessionContextValue {
  const context = useContext(SessionContext);
  if (!context) {
    throw new Error('useLiveSession must be used within a SessionProvider');
  }
  return context;
}
