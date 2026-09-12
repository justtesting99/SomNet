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
  fetchActiveSession,
  startSession as startSessionApi,
  endSession as endSessionApi,
  updateSession as updateSessionApi,
} from '@/api/sessions';
import { useAuth } from '@/context/AuthProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import type { SubTargetName } from '@/config/sessionUsers';
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
import { queueCaptureActionSnapshots } from '@/api/videoSnapshots';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';

interface ActiveSessionState {
  id: string;
  startedAt: string;
  mode: OperationMode;
  subTarget: SubTargetName;
  events: ManualActionEvent[];
  abortCount: number;
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
  syncSessionFromRemote: (entry: SessionHistoryEntry | null) => void;
  /** Ensures an in-progress manual session exists (for video preview before first stroke). */
  prepareManualSession: () => Promise<void>;
  /** Ensures an in-progress automatic session record exists (for video preview before Start). */
  prepareAutomaticSession: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const [activeSession, setActiveSession] = useState<ActiveSessionState | null>(null);
  const [manualVideoActivitySeq, setManualVideoActivitySeq] = useState(0);
  const [manualVideoRehydrateSeq, setManualVideoRehydrateSeq] = useState(0);
  const activeSessionRef = useRef<ActiveSessionState | null>(null);
  const startingRef = useRef(false);

  activeSessionRef.current = activeSession;

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
      events: manualProgress?.events ?? [],
      abortCount: manualProgress?.abortCount ?? 0,
    };
  }, []);

  const ensureManualSession = useCallback(async () => {
    if (activeSessionRef.current || startingRef.current || !domTarget) {
      return;
    }

    startingRef.current = true;

    try {
      const existing = await fetchActiveSession(selectedSub);
      if (existing && isRehydratableManualSession(existing)) {
        const nextSession = buildSessionFromEntry(existing);
        activeSessionRef.current = nextSession;
        setActiveSession(nextSession);
        return;
      }

      const entry = await startSessionApi(selectedSub, 'manual');
      const nextSession: ActiveSessionState = {
        id: entry.id,
        startedAt: entry.startedAt,
        mode: 'manual',
        subTarget: selectedSub,
        events: [],
        abortCount: 0,
      };
      activeSessionRef.current = nextSession;
      setActiveSession(nextSession);
    } finally {
      startingRef.current = false;
    }
  }, [buildSessionFromEntry, domTarget, selectedSub]);

  const finalizeSession = useCallback(async (summary: string) => {
    const current = activeSessionRef.current;
    if (!current) {
      return;
    }

    try {
      await endSessionApi(current.id, summary);
      activeSessionRef.current = null;
      setActiveSession(null);
    } catch {
      // Keep activeSession so Stop/retry or rehydration can finish the server record.
    }
  }, []);

  const beginAutomaticSession = useCallback(async () => {
    if (activeSessionRef.current || startingRef.current || !domTarget) {
      return;
    }

    startingRef.current = true;

    try {
      const entry = await startSessionApi(selectedSub, 'automatic');
      const nextSession: ActiveSessionState = {
        id: entry.id,
        startedAt: entry.startedAt,
        mode: 'automatic',
        subTarget: selectedSub,
        events: [],
        abortCount: 0,
      };
      activeSessionRef.current = nextSession;
      setActiveSession(nextSession);
    } finally {
      startingRef.current = false;
    }
  }, [domTarget, selectedSub]);

  const recordManualStroke = useCallback(
    async (powerPercent: number, actualStrokeMs?: number) => {
      await ensureManualSession();

      const current = activeSessionRef.current;
      if (!current || current.mode !== 'manual') {
        return;
      }

      const nextSession: ActiveSessionState = {
        ...current,
        events: [...current.events, { type: 'stroke', powerPercent, actualStrokeMs }],
      };
      activeSessionRef.current = nextSession;
      setActiveSession(nextSession);
      bumpManualVideoActivity();
      markManualVideoCommandComplete();
      await persistManualProgress(nextSession);
      queueCaptureActionSnapshots({
        sessionId: nextSession.id,
        subTarget: selectedSub,
        actionIndex: nextSession.events.length - 1,
        commandKey: HARDWARE_COMMAND_KEYS.manualStroke,
      });
    },
    [bumpManualVideoActivity, ensureManualSession, persistManualProgress, selectedSub],
  );

  const recordManualAbort = useCallback(async () => {
    await ensureManualSession();

    const current = activeSessionRef.current;
    if (!current || current.mode !== 'manual') {
      return;
    }

    const nextSession: ActiveSessionState = {
      ...current,
      abortCount: current.abortCount + 1,
    };
    activeSessionRef.current = nextSession;
    setActiveSession(nextSession);
    bumpManualVideoActivity();
    markManualVideoCommandComplete();
    await persistManualProgress(nextSession);
  }, [bumpManualVideoActivity, ensureManualSession, persistManualProgress]);

  const recordManualBurst = useCallback(
    async (
      powerPercent: number,
      burstStrokes: number,
      burstDelaySeconds: number,
      strokesCompleted?: number,
    ) => {
      await ensureManualSession();

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
      activeSessionRef.current = nextSession;
      setActiveSession(nextSession);
      bumpManualVideoActivity();
      markManualVideoCommandComplete();
      await persistManualProgress(nextSession);
      queueCaptureActionSnapshots({
        sessionId: nextSession.id,
        subTarget: selectedSub,
        actionIndex: nextSession.events.length - 1,
        commandKey: HARDWARE_COMMAND_KEYS.manualBurst,
      });
    },
    [bumpManualVideoActivity, ensureManualSession, persistManualProgress, selectedSub],
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

      const summary = buildAutomaticSessionSummary(deviceResult ?? null, reason);
      await finalizeSession(summary);
    },
    [finalizeSession],
  );

  const rehydrateSession = useCallback(
    (entry: SessionHistoryEntry) => {
      if (activeSessionRef.current || startingRef.current) {
        return;
      }

      const nextSession = buildSessionFromEntry(entry);
      activeSessionRef.current = nextSession;
      setActiveSession(nextSession);
      if (isRehydratableManualSession(entry)) {
        bumpManualVideoActivity();
        bumpManualVideoRehydrate();
      }
    },
    [buildSessionFromEntry, bumpManualVideoActivity, bumpManualVideoRehydrate],
  );

  const syncSessionFromRemote = useCallback(
    (entry: SessionHistoryEntry | null) => {
      if (entry === null) {
        activeSessionRef.current = null;
        setActiveSession(null);
        return;
      }

      const nextSession = buildSessionFromEntry(entry);
      if (activeSessionRef.current?.id === entry.id) {
        activeSessionRef.current = nextSession;
        setActiveSession(nextSession);
        return;
      }

      if (
        entry !== null &&
        isRehydratableManualSession(entry) &&
        !activeSessionRef.current
      ) {
        bumpManualVideoRehydrate();
      }

      activeSessionRef.current = nextSession;
      setActiveSession(nextSession);
    },
    [buildSessionFromEntry, bumpManualVideoRehydrate],
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
          reason === 'sub-change'
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

  const value = useMemo(
    () => ({
      activeSession,
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
      prepareManualSession: ensureManualSession,
      prepareAutomaticSession: beginAutomaticSession,
    }),
    [
      activeSession,
      manualVideoActivitySeq,
      manualVideoRehydrateSeq,
      beginAutomaticSession,
      endActiveSessionIfNeeded,
      endAutomaticSession,
      endManualSession,
      ensureManualSession,
      rehydrateSession,
      syncSessionFromRemote,
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
