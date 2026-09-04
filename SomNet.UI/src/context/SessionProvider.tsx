import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { startSession as startSessionApi, endSession as endSessionApi, updateSession as updateSessionApi } from '@/api/sessions';
import { useAuth } from '@/context/AuthProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import type { SubTargetName } from '@/config/sessionUsers';
import type { OperationMode } from '@/types/modes';
import {
  buildAutomaticSessionSummary,
  buildManualSessionSummary,
  type ManualSessionEndReason,
} from '@/utils/sessionSummary';

interface ActiveSessionState {
  id: string;
  startedAt: string;
  mode: OperationMode;
  subTarget: SubTargetName;
  strokeCount: number;
  burstCount: number;
  abortCount: number;
  burstStrokes: number;
  burstDelaySeconds: number;
}

interface SessionContextValue {
  activeSession: ActiveSessionState | null;
  beginAutomaticSession: () => Promise<void>;
  recordManualStroke: (burstStrokes: number, burstDelaySeconds: number) => Promise<void>;
  recordManualBurst: (burstStrokes: number, burstDelaySeconds: number) => Promise<void>;
  endManualSession: (reason: ManualSessionEndReason) => Promise<void>;
  endAutomaticSession: (reason: string) => Promise<void>;
  endActiveSessionIfNeeded: (reason: ManualSessionEndReason | string) => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const [activeSession, setActiveSession] = useState<ActiveSessionState | null>(null);
  const activeSessionRef = useRef<ActiveSessionState | null>(null);
  const startingRef = useRef(false);

  activeSessionRef.current = activeSession;

  const domTarget = user?.displayName ?? user?.username ?? '';

  const buildManualSummary = useCallback((session: ActiveSessionState, abortCount = session.abortCount) => {
    return buildManualSessionSummary({
      strokeCount: session.strokeCount,
      burstCount: session.burstCount,
      burstStrokes: session.burstStrokes,
      burstDelaySeconds: session.burstDelaySeconds,
      abortCount,
    });
  }, []);

  const persistManualProgress = useCallback(
    async (session: ActiveSessionState, abortCount = session.abortCount) => {
      const summary = buildManualSummary(session, abortCount);
      await updateSessionApi(session.id, summary);
    },
    [buildManualSummary],
  );

  const ensureManualSession = useCallback(async () => {
    if (activeSessionRef.current || startingRef.current || !domTarget) {
      return;
    }

    startingRef.current = true;

    try {
      const entry = await startSessionApi(selectedSub, 'manual');
      const nextSession: ActiveSessionState = {
        id: entry.id,
        startedAt: entry.startedAt,
        mode: 'manual',
        subTarget: selectedSub,
        strokeCount: 0,
        burstCount: 0,
        abortCount: 0,
        burstStrokes: 5,
        burstDelaySeconds: 5,
      };
      activeSessionRef.current = nextSession;
      setActiveSession(nextSession);
    } finally {
      startingRef.current = false;
    }
  }, [domTarget, selectedSub]);

  const finalizeSession = useCallback(async (summary: string) => {
    const current = activeSessionRef.current;
    if (!current) {
      return;
    }

    activeSessionRef.current = null;
    setActiveSession(null);

    try {
      await endSessionApi(current.id, summary);
    } catch {
      // Session already cleared locally; history may be missing this end event.
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
        strokeCount: 0,
        burstCount: 0,
        abortCount: 0,
        burstStrokes: 0,
        burstDelaySeconds: 0,
      };
      activeSessionRef.current = nextSession;
      setActiveSession(nextSession);
    } finally {
      startingRef.current = false;
    }
  }, [domTarget, selectedSub]);

  const recordManualStroke = useCallback(
    async (burstStrokes: number, burstDelaySeconds: number) => {
      await ensureManualSession();

      const current = activeSessionRef.current;
      if (!current || current.mode !== 'manual') {
        return;
      }

      const nextSession = {
        ...current,
        strokeCount: current.strokeCount + 1,
        burstStrokes,
        burstDelaySeconds,
      };
      activeSessionRef.current = nextSession;
      setActiveSession(nextSession);
      await persistManualProgress(nextSession);
    },
    [ensureManualSession, persistManualProgress],
  );

  const recordManualBurst = useCallback(
    async (burstStrokes: number, burstDelaySeconds: number) => {
      await ensureManualSession();

      const current = activeSessionRef.current;
      if (!current || current.mode !== 'manual') {
        return;
      }

      const nextSession = {
        ...current,
        burstCount: current.burstCount + 1,
        burstStrokes,
        burstDelaySeconds,
      };
      activeSessionRef.current = nextSession;
      setActiveSession(nextSession);
      await persistManualProgress(nextSession);
    },
    [ensureManualSession, persistManualProgress],
  );

  const endManualSession = useCallback(
    async (reason: ManualSessionEndReason) => {
      const current = activeSessionRef.current;
      if (!current || current.mode !== 'manual') {
        return;
      }

      const abortCount = reason === 'abort' ? current.abortCount + 1 : current.abortCount;
      const summary = buildManualSummary(current, abortCount);

      await finalizeSession(summary);
    },
    [buildManualSummary, finalizeSession],
  );

  const endAutomaticSession = useCallback(
    async (reason: string) => {
      const current = activeSessionRef.current;
      if (!current || current.mode !== 'automatic') {
        return;
      }

      const summary = buildAutomaticSessionSummary(current.startedAt, reason);
      await finalizeSession(summary);
    },
    [finalizeSession],
  );

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
      beginAutomaticSession,
      recordManualStroke,
      recordManualBurst,
      endManualSession,
      endAutomaticSession,
      endActiveSessionIfNeeded,
    }),
    [
      activeSession,
      beginAutomaticSession,
      endActiveSessionIfNeeded,
      endAutomaticSession,
      endManualSession,
      recordManualBurst,
      recordManualStroke,
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
