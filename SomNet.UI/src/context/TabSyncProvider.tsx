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
import { fetchActiveSession } from '@/api/sessions';
import { useAuth } from '@/context/AuthProvider';
import { useMode } from '@/context/ModeProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import type { HardwareCommandKey } from '@/types/hardwareCommand';
import {
  isRehydratableAutomaticSession,
  isRehydratableManualSession,
} from '@/utils/sessionProgress';
import {
  getTabId,
  postTabSync,
  subscribeTabSync,
  type ActiveSessionSnapshot,
  type TabSyncMessage,
  withRemoteSyncApply,
  withRemoteSyncApplyAsync,
} from '@/utils/tabSync';
interface TabSyncContextValue {
  hasRemoteCommandLock: boolean;
  isRemoteCommandPending: (commandKey: HardwareCommandKey) => boolean;
}

const TabSyncContext = createContext<TabSyncContextValue | null>(null);

export function TabSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { setMode } = useMode();
  const { selectedSub, applySubFromSync } = useSubTarget();
  const { settings, settingsLoaded, setAutomaticRunningLocal } = useOptions();
  const { activeSession, syncSessionFromRemote, endActiveSessionIfNeeded } = useLiveSession();

  const [remotePendingKeys, setRemotePendingKeys] = useState<ReadonlySet<HardwareCommandKey>>(
    () => new Set(),
  );

  const remoteLocksRef = useRef(new Map<string, ReadonlySet<HardwareCommandKey>>());
  const applyingSessionIdRef = useRef<string | null>(null);
  const activeSessionRef = useRef(activeSession);
  const settingsRef = useRef(settings);
  const selectedSubRef = useRef(selectedSub);

  activeSessionRef.current = activeSession;
  settingsRef.current = settings;
  selectedSubRef.current = selectedSub;

  const domTarget = user?.displayName ?? user?.username ?? '';

  const mergeRemoteLocks = useCallback(() => {
    const merged = new Set<HardwareCommandKey>();
    const selfId = getTabId();

    for (const [tabId, keys] of remoteLocksRef.current.entries()) {
      if (tabId === selfId) {
        continue;
      }

      for (const key of keys) {
        merged.add(key);
      }
    }

    setRemotePendingKeys(merged);
  }, []);

  const broadcastLocalState = useCallback(() => {
    const session = activeSessionRef.current;

    postTabSync({
      type: 'session',
      tabId: getTabId(),
      session: session
        ? {
            id: session.id,
            startedAt: session.startedAt,
            mode: session.mode,
            subTarget: session.subTarget,
          }
        : null,
    });

    postTabSync({
      type: 'running',
      tabId: getTabId(),
      running: settingsRef.current.automatic.running,
    });

    postTabSync({
      type: 'sub',
      tabId: getTabId(),
      subTarget: selectedSubRef.current,
    });
  }, []);

  const applySessionSnapshot = useCallback(
    async (snapshot: ActiveSessionSnapshot | null) => {
      if (snapshot === null) {
        if (!activeSessionRef.current) {
          return;
        }

        withRemoteSyncApply(() => {
          syncSessionFromRemote(null);
        });
        return;
      }

      if (activeSessionRef.current?.id === snapshot.id && snapshot.mode !== 'manual') {
        return;
      }

      if (applyingSessionIdRef.current === snapshot.id) {
        return;
      }

      applyingSessionIdRef.current = snapshot.id;

      if (snapshot.subTarget !== selectedSubRef.current) {
        await endActiveSessionIfNeeded('sub-change');
        withRemoteSyncApply(() => {
          applySubFromSync(snapshot.subTarget);
        });
      }

      try {
        const entry = await fetchActiveSession(snapshot.subTarget);
        if (!entry || entry.id !== snapshot.id) {
          withRemoteSyncApply(() => {
            syncSessionFromRemote(null);
          });
          return;
        }

        if (entry.mode === 'manual' && !isRehydratableManualSession(entry)) {
          withRemoteSyncApply(() => {
            syncSessionFromRemote(null);
          });
          return;
        }

        if (entry.mode === 'automatic' && !isRehydratableAutomaticSession(entry)) {
          withRemoteSyncApply(() => {
            syncSessionFromRemote(null);
          });
          return;
        }

        // Multi-tab sync: trust peer + server row — never probe device (automatic-update).
        await withRemoteSyncApplyAsync(() => {
          syncSessionFromRemote(entry);
          setMode(entry.mode);

          if (entry.mode === 'automatic' && !settingsRef.current.automatic.running) {
            setAutomaticRunningLocal(true);
          }
        });
      } catch {
        // Keep local state if reconcile fails.
      } finally {
        if (applyingSessionIdRef.current === snapshot.id) {
          applyingSessionIdRef.current = null;
        }
      }
    },
    [
      applySubFromSync,
      endActiveSessionIfNeeded,
      setAutomaticRunningLocal,
      setMode,
      syncSessionFromRemote,
    ],
  );

  const reconcileFromServer = useCallback(async () => {
    if (!domTarget || !settingsLoaded) {
      return;
    }

    try {
      const entry = await fetchActiveSession(selectedSubRef.current);
      if (!entry) {
        // Manual sessions are client-authoritative while in progress; a transient 404 on
        // /api/sessions/active must not clear local state (that unmounts video iframes).
        if (activeSessionRef.current?.mode === 'manual') {
          return;
        }

        if (activeSessionRef.current) {
          withRemoteSyncApply(() => {
            syncSessionFromRemote(null);
          });
        }
        return;
      }

      if (activeSessionRef.current?.id === entry.id) {
        return;
      }

      if (
        (entry.mode === 'manual' && isRehydratableManualSession(entry)) ||
        (entry.mode === 'automatic' && isRehydratableAutomaticSession(entry))
      ) {
        await applySessionSnapshot({
          id: entry.id,
          startedAt: entry.startedAt,
          mode: entry.mode,
          subTarget: entry.subTarget,
        });
      }
    } catch {
      // Ignore reconcile errors.
    }
  }, [applySessionSnapshot, domTarget, settingsLoaded, syncSessionFromRemote]);

  useEffect(() => {
    return subscribeTabSync((message: TabSyncMessage) => {
      switch (message.type) {
        case 'session':
          void applySessionSnapshot(message.session);
          break;
        case 'running':
          withRemoteSyncApply(() => {
            setAutomaticRunningLocal(message.running);
          });
          break;
        case 'sub':
          if (message.subTarget !== selectedSubRef.current) {
            void (async () => {
              await endActiveSessionIfNeeded('sub-change');
              withRemoteSyncApply(() => {
                applySubFromSync(message.subTarget);
              });
            })();
          }
          break;
        case 'command-lock':
          remoteLocksRef.current.set(message.tabId, new Set(message.keys));
          mergeRemoteLocks();
          break;
        case 'request-sync':
          broadcastLocalState();
          break;
        default:
          break;
      }
    });
  }, [
    applySessionSnapshot,
    applySubFromSync,
    broadcastLocalState,
    endActiveSessionIfNeeded,
    mergeRemoteLocks,
    setAutomaticRunningLocal,
  ]);

  useEffect(() => {
    postTabSync({ type: 'request-sync', tabId: getTabId() });
  }, []);

  useEffect(() => {
    function handleVisibilityChange() {
      if (document.visibilityState === 'visible') {
        void reconcileFromServer();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [reconcileFromServer]);

  const hasRemoteCommandLock = remotePendingKeys.size > 0;

  const isRemoteCommandPending = useCallback(
    (commandKey: HardwareCommandKey) => remotePendingKeys.has(commandKey),
    [remotePendingKeys],
  );

  const value = useMemo(
    () => ({
      hasRemoteCommandLock,
      isRemoteCommandPending,
    }),
    [hasRemoteCommandLock, isRemoteCommandPending],
  );

  return <TabSyncContext.Provider value={value}>{children}</TabSyncContext.Provider>;
}

export function useTabSync(): TabSyncContextValue {
  const context = useContext(TabSyncContext);
  if (!context) {
    throw new Error('useTabSync must be used within a TabSyncProvider');
  }
  return context;
}
