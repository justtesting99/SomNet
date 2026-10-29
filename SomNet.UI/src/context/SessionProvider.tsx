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
import { deviceIdFromSessionKey, sessionDeviceKey } from '@/utils/sessionDeviceKey';
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
export interface ActiveSessionState {
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
  sessionsByKey: Record<string, ActiveSessionState>;
  /** Incremented when a manual stroke/burst/abort completes or manual session rehydrates (video idle timer). */
  manualVideoActivitySeq: number;
  /** Incremented on manual session rehydrate (refresh / tab sync); survives hook remount. */
  manualVideoRehydrateSeq: number;
  endAutomaticSessionForDevice: (
    subTarget: SubTargetName,
    deviceId: string,
    reason: string,
    deviceResult?: AutomaticResultJson | null,
  ) => Promise<void>;
  endManualSessionForDevice: (deviceId: string, reason: ManualSessionEndReason) => Promise<void>;
  /** End every in-progress server session row on the current Sub (tab/sub change). */
  endAllInProgressSessionsForSub: (reason: ManualSessionEndReason | string) => Promise<void>;
  rehydrateSession: (entry: SessionHistoryEntry) => void;
  syncSessionFromRemote: (entry: SessionHistoryEntry | null, deviceIdForClear?: string) => void;
  /** Returns the action index to use for the next manual stroke/burst snapshot. */
  prepareManualSessionForDevice: (deviceId: string) => Promise<number>;
  prepareAutomaticSessionForDevice: (deviceId: string) => Promise<void>;
  recordManualStrokeForDevice: (
    deviceId: string,
    powerPercent: number,
    actualStrokeMs?: number,
  ) => Promise<void>;
  recordManualBurstForDevice: (
    deviceId: string,
    powerPercent: number,
    burstStrokes: number,
    burstDelaySeconds: number,
    strokesCompleted?: number,
  ) => Promise<void>;
  recordManualAbortForDevice: (deviceId: string) => Promise<void>;
  startSessionForDevice: (deviceId: string, mode: OperationMode) => Promise<void>;
  endSessionForAccessoryForDevice: (
    deviceId: string,
    options: EndSessionForAccessoryOptions,
  ) => Promise<void>;
  syncActiveSessionModeForDevice: (deviceId: string, mode: OperationMode) => Promise<void>;
  markAutomaticDeviceStartedForDevice: (deviceId: string) => void;
  isAutomaticSessionActiveForDevice: (subTarget: SubTargetName, deviceId: string) => boolean;
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
  const startingRef = useRef<Record<string, boolean>>({});

  sessionsByKeyRef.current = sessionsByKey;

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

  const startSessionForDevice = useCallback(
    async (deviceId: string, mode: OperationMode) => {
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

  const isAutomaticSessionActiveForDevice = useCallback(
    (subTarget: SubTargetName, deviceId: string) => {
      const session = sessionsByKeyRef.current[sessionDeviceKey(subTarget, deviceId)];
      return session?.mode === 'automatic';
    },
    [],
  );

  const sessionForDevice = useCallback(
    (deviceId: string) =>
      sessionsByKeyRef.current[sessionDeviceKey(selectedSub, deviceId)] ?? null,
    [selectedSub],
  );

  const syncActiveSessionModeForDevice = useCallback(
    async (deviceId: string, mode: OperationMode) => {
      const current = sessionForDevice(deviceId);
      if (!current || current.mode === mode) {
        return;
      }

      await patchSessionModeApi(current.id, mode);
      const nextSession: ActiveSessionState = { ...current, mode };
      setSessionForDevice(current.subTarget, current.deviceId, nextSession);
    },
    [sessionForDevice, setSessionForDevice],
  );

  const markAutomaticDeviceStartedForDevice = useCallback(
    (deviceId: string) => {
      const current = sessionForDevice(deviceId);
      if (!current || current.automaticDeviceStarted) {
        return;
      }

      const nextSession: ActiveSessionState = { ...current, automaticDeviceStarted: true };
      setSessionForDevice(current.subTarget, current.deviceId, nextSession);
    },
    [sessionForDevice, setSessionForDevice],
  );

  const prepareManualSessionForDevice = useCallback(
    async (deviceId: string): Promise<number> => {
      const current = sessionForDevice(deviceId);
      if (!current || current.mode !== 'manual') {
        throw new Error('Scene session must be on before manual actions on this device.');
      }

      return current.events.length;
    },
    [sessionForDevice],
  );

  const prepareAutomaticSessionForDevice = useCallback(
    async (deviceId: string) => {
      const current = sessionForDevice(deviceId);
      if (!current || current.mode !== 'automatic') {
        return;
      }
    },
    [sessionForDevice],
  );

  const finalizeSessionFor = useCallback(
    async (session: ActiveSessionState, summary: string) => {
      try {
        await endSessionApi(session.id, summary);
        setSessionForDevice(session.subTarget, session.deviceId, null);
      } catch {
        // Keep session row so Stop/retry or rehydration can finish the server record.
      }
    },
    [setSessionForDevice],
  );

  const recordManualStrokeForDevice = useCallback(
    async (deviceId: string, powerPercent: number, actualStrokeMs?: number) => {
      const current = sessionForDevice(deviceId);
      if (!current || current.mode !== 'manual') {
        return;
      }

      const nextSession: ActiveSessionState = {
        ...current,
        events: [...current.events, { type: 'stroke', powerPercent, actualStrokeMs }],
      };
      setSessionForDevice(current.subTarget, current.deviceId, nextSession);
      if (deviceId === selectedDeviceId) {
        bumpManualVideoActivity();
        markManualVideoCommandComplete();
      }
      await persistManualProgress(nextSession);
    },
    [
      bumpManualVideoActivity,
      persistManualProgress,
      selectedDeviceId,
      sessionForDevice,
      setSessionForDevice,
    ],
  );

  const recordManualAbortForDevice = useCallback(
    async (deviceId: string) => {
      const current = sessionForDevice(deviceId);
      if (!current || current.mode !== 'manual') {
        return;
      }

      const nextSession: ActiveSessionState = {
        ...current,
        abortCount: current.abortCount + 1,
      };
      setSessionForDevice(current.subTarget, current.deviceId, nextSession);
      if (deviceId === selectedDeviceId) {
        bumpManualVideoActivity();
        markManualVideoCommandComplete();
      }
      await persistManualProgress(nextSession);
    },
    [
      bumpManualVideoActivity,
      persistManualProgress,
      selectedDeviceId,
      sessionForDevice,
      setSessionForDevice,
    ],
  );

  const recordManualBurstForDevice = useCallback(
    async (
      deviceId: string,
      powerPercent: number,
      burstStrokes: number,
      burstDelaySeconds: number,
      strokesCompleted?: number,
    ) => {
      const current = sessionForDevice(deviceId);
      if (!current || current.mode !== 'manual') {
        return;
      }

      const completedStrokes = strokesCompleted ?? burstStrokes;

      const nextSession: ActiveSessionState = {
        ...current,
        events: [
          ...current.events,
          {
            type: 'burst',
            powerPercent,
            burstStrokes: completedStrokes,
            burstDelaySeconds,
          },
        ],
      };
      setSessionForDevice(current.subTarget, current.deviceId, nextSession);
      if (deviceId === selectedDeviceId) {
        bumpManualVideoActivity();
        markManualVideoCommandComplete();
      }
      await persistManualProgress(nextSession);
    },
    [
      bumpManualVideoActivity,
      persistManualProgress,
      selectedDeviceId,
      sessionForDevice,
      setSessionForDevice,
    ],
  );

  const endManualSessionForDevice = useCallback(
    async (deviceId: string, reason: ManualSessionEndReason) => {
      const current = sessionForDevice(deviceId);
      if (!current || current.mode !== 'manual') {
        return;
      }

      const abortCount = reason === 'abort' ? current.abortCount + 1 : current.abortCount;
      const summary = buildManualSummary(current, abortCount, false);
      await finalizeSessionFor(current, summary);
    },
    [buildManualSummary, finalizeSessionFor, sessionForDevice],
  );

  const endAutomaticSessionForDevice = useCallback(
    async (
      subTarget: SubTargetName,
      deviceId: string,
      reason: string,
      deviceResult?: AutomaticResultJson | null,
    ) => {
      const key = sessionDeviceKey(subTarget, deviceId);
      const current = sessionsByKeyRef.current[key];
      if (!current || current.mode !== 'automatic') {
        return;
      }

      const automaticSummary = buildAutomaticSessionSummary(deviceResult ?? null, reason);
      const hasManualActivity = current.events.length > 0 || current.abortCount > 0;
      const summary = hasManualActivity
        ? `${buildManualSummary(current, current.abortCount, false).replace(/\.$/, '')}; ${automaticSummary}`
        : automaticSummary;
      await finalizeSessionFor(current, summary);
    },
    [buildManualSummary, finalizeSessionFor],
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

  const sessionsBroadcastRef = useRef<Record<string, ActiveSessionState>>({});

  useEffect(() => {
    if (!shouldBroadcastLocalChange()) {
      return;
    }

    const previous = sessionsBroadcastRef.current;
    const keys = new Set([...Object.keys(previous), ...Object.keys(sessionsByKey)]);

    for (const key of keys) {
      const nextSession = sessionsByKey[key];
      const prevSession = previous[key];
      if (
        nextSession?.id === prevSession?.id &&
        nextSession?.mode === prevSession?.mode &&
        nextSession?.startedAt === prevSession?.startedAt
      ) {
        continue;
      }

      const deviceId =
        nextSession?.deviceId ??
        prevSession?.deviceId ??
        deviceIdFromSessionKey(selectedSub, key);
      if (!deviceId) {
        continue;
      }

      postTabSync({
        type: 'device-session',
        tabId: getTabId(),
        subTarget: selectedSub,
        deviceId,
        session: nextSession
          ? {
              id: nextSession.id,
              startedAt: nextSession.startedAt,
              mode: nextSession.mode,
              subTarget: nextSession.subTarget,
              deviceId: nextSession.deviceId,
            }
          : null,
      });
    }

    sessionsBroadcastRef.current = { ...sessionsByKey };
  }, [selectedSub, sessionsByKey]);

  const endAllInProgressSessionsForSub = useCallback(
    async (reason: ManualSessionEndReason | string) => {
      const sessions = Object.values(sessionsByKeyRef.current);
      for (const session of sessions) {
        if (session.subTarget !== selectedSub) {
          continue;
        }

        if (session.mode === 'manual') {
          const summary = buildManualSummary(session, session.abortCount, false);
          await finalizeSessionFor(session, summary);
          continue;
        }

        const automaticReason =
          typeof reason === 'string' && reason.length > 0 ? reason : 'stopped manually';
        const automaticSummary = buildAutomaticSessionSummary(null, automaticReason);
        const hasManualActivity = session.events.length > 0 || session.abortCount > 0;
        const summary = hasManualActivity
          ? `${buildManualSummary(session, session.abortCount, false).replace(/\.$/, '')}; ${automaticSummary}`
          : automaticSummary;
        await finalizeSessionFor(session, summary);
      }
    },
    [buildManualSummary, finalizeSessionFor, selectedSub],
  );

  const discardSessionForDevice = useCallback(
    async (deviceId: string) => {
      const current = sessionsByKeyRef.current[sessionDeviceKey(selectedSub, deviceId)];
      if (!current) {
        return;
      }

      try {
        await discardInProgressSessionApi(current.id);
        setSessionForDevice(current.subTarget, current.deviceId, null);
      } catch {
        if (current.mode === 'manual') {
          await endManualSessionForDevice(deviceId, 'session-accessory-off');
        } else {
          await endAutomaticSessionForDevice(
            selectedSub,
            deviceId,
            'session-accessory-off',
            null,
          );
        }
      }
    },
    [
      endAutomaticSessionForDevice,
      endManualSessionForDevice,
      finalizeSessionFor,
      selectedSub,
      setSessionForDevice,
    ],
  );

  const endSessionForAccessoryForDevice = useCallback(
    async (deviceId: string, options: EndSessionForAccessoryOptions) => {
      const current = sessionsByKeyRef.current[sessionDeviceKey(selectedSub, deviceId)];
      if (!current) {
        return;
      }

      const discardManual =
        current.mode === 'manual' && current.events.length === 0 && current.abortCount === 0;
      const discardAutomatic = current.mode === 'automatic' && !options.automaticDeviceStarted;

      if (discardManual || discardAutomatic) {
        await discardSessionForDevice(deviceId);
        return;
      }

      if (current.mode === 'automatic') {
        await endAutomaticSessionForDevice(
          selectedSub,
          deviceId,
          'session-accessory-off',
          options.automaticDeviceResult ?? null,
        );
        return;
      }

      const summary = buildManualSummary(current, current.abortCount, false);
      await finalizeSessionFor(current, summary);
    },
    [
      buildManualSummary,
      discardSessionForDevice,
      endAutomaticSessionForDevice,
      finalizeSessionFor,
      selectedSub,
    ],
  );

  const value = useMemo(
    () => ({
      sessionsByKey,
      manualVideoActivitySeq,
      manualVideoRehydrateSeq,
      recordManualStrokeForDevice,
      recordManualAbortForDevice,
      recordManualBurstForDevice,
      endManualSessionForDevice,
      endAutomaticSessionForDevice,
      endAllInProgressSessionsForSub,
      rehydrateSession,
      syncSessionFromRemote,
      prepareManualSessionForDevice,
      prepareAutomaticSessionForDevice,
      startSessionForDevice,
      endSessionForAccessoryForDevice,
      syncActiveSessionModeForDevice,
      markAutomaticDeviceStartedForDevice,
      isAutomaticSessionActiveForDevice,
    }),
    [
      sessionsByKey,
      manualVideoActivitySeq,
      manualVideoRehydrateSeq,
      endAllInProgressSessionsForSub,
      endAutomaticSessionForDevice,
      endManualSessionForDevice,
      endSessionForAccessoryForDevice,
      prepareAutomaticSessionForDevice,
      prepareManualSessionForDevice,
      rehydrateSession,
      syncSessionFromRemote,
      syncActiveSessionModeForDevice,
      startSessionForDevice,
      markAutomaticDeviceStartedForDevice,
      isAutomaticSessionActiveForDevice,
      recordManualBurstForDevice,
      recordManualStrokeForDevice,
      recordManualAbortForDevice,
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
