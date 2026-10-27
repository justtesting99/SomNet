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
import { useDeviceOperationModeApi } from '@/context/DeviceOperationModeProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import type { HardwareCommandKey } from '@/types/hardwareCommand';
import {
  hasRemoteLockForDevice,
  isRemoteLockForCommand,
} from '@/utils/hardwareCommandLock';
import {
  isRehydratableAutomaticSession,
  isRehydratableManualSession,
} from '@/utils/sessionProgress';
import { shouldRestoreAutomaticDeviceRunning } from '@/utils/automaticDeviceRunningHint';
import { subTargetsMatch } from '@/utils/readyBannerStorage';
import {
  automaticRunningKindForActuator,
  getTabId,
  postTabSync,
  subscribeTabSync,
  type ActiveSessionSnapshot,
  type TabSyncMessage,
  withRemoteSyncApply,
  withRemoteSyncApplyAsync,
} from '@/utils/tabSync';
interface TabSyncContextValue {
  hasRemoteCommandLock: (deviceId: string) => boolean;
  isRemoteCommandPending: (commandKey: HardwareCommandKey, deviceId: string) => boolean;
}

const TabSyncContext = createContext<TabSyncContextValue | null>(null);

export function TabSyncProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { setDeviceOperationMode } = useDeviceOperationModeApi();
  const { selectedSub, applySubFromSync } = useSubTarget();
  const { selectedDeviceId, registrations } = useSubDevice();
  const {
    settings,
    settingsLoaded,
    setDeviceAutomaticRunning,
  } = useOptions();
  const registrationsRef = useRef(registrations);
  registrationsRef.current = registrations;
  const {
    activeSession,
    sessionsByKey,
    syncSessionFromRemote,
    endAllInProgressSessionsForSub,
  } = useLiveSession();

  const [remotePendingKeys, setRemotePendingKeys] = useState<ReadonlySet<string>>(() => new Set());

  const remoteLocksRef = useRef(new Map<string, ReadonlySet<string>>());
  const applyingSessionIdRef = useRef<string | null>(null);
  const activeSessionRef = useRef(activeSession);
  const settingsRef = useRef(settings);
  const selectedSubRef = useRef(selectedSub);
  const selectedDeviceIdRef = useRef(selectedDeviceId);

  activeSessionRef.current = activeSession;
  settingsRef.current = settings;
  selectedSubRef.current = selectedSub;
  selectedDeviceIdRef.current = selectedDeviceId;

  const domTarget = user?.displayName ?? user?.username ?? '';

  const mergeRemoteLocks = useCallback(() => {
    const merged = new Set<string>();
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

  const sessionsByKeyRef = useRef(sessionsByKey);
  sessionsByKeyRef.current = sessionsByKey;

  const broadcastLocalState = useCallback(() => {
    for (const session of Object.values(sessionsByKeyRef.current)) {
      postTabSync({
        type: 'device-session',
        tabId: getTabId(),
        subTarget: session.subTarget,
        deviceId: session.deviceId,
        session: {
          id: session.id,
          startedAt: session.startedAt,
          mode: session.mode,
          subTarget: session.subTarget,
          deviceId: session.deviceId,
        },
      });
    }

    postTabSync({
      type: 'sub',
      tabId: getTabId(),
      subTarget: selectedSubRef.current,
    });
  }, []);

  const applySessionSnapshot = useCallback(
    async (snapshot: ActiveSessionSnapshot | null, deviceIdForClear?: string) => {
      if (snapshot === null) {
        const deviceId =
          deviceIdForClear ??
          activeSessionRef.current?.deviceId ??
          selectedDeviceIdRef.current ??
          undefined;
        if (!deviceId) {
          return;
        }

        withRemoteSyncApply(() => {
          syncSessionFromRemote(null, deviceId);
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
        await endAllInProgressSessionsForSub('sub-change');
        withRemoteSyncApply(() => {
          applySubFromSync(snapshot.subTarget);
        });
      }

      try {
        const entry = await fetchActiveSession(snapshot.subTarget, snapshot.deviceId);
        if (!entry || entry.id !== snapshot.id) {
          withRemoteSyncApply(() => {
            syncSessionFromRemote(null, snapshot.deviceId);
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
          setDeviceOperationMode(snapshot.deviceId, entry.mode);

          if (
            entry.mode === 'automatic' &&
            shouldRestoreAutomaticDeviceRunning(entry.id, entry.subTarget, snapshot.deviceId)
          ) {
            const registration = registrationsRef.current.find(
              (row) => row.deviceId === snapshot.deviceId,
            );
            const restoreKind = automaticRunningKindForActuator(registration?.actuatorKind ?? null);
            setDeviceAutomaticRunning(snapshot.deviceId, restoreKind, true);
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
      endAllInProgressSessionsForSub,
      setDeviceAutomaticRunning,
      setDeviceOperationMode,
      syncSessionFromRemote,
    ],
  );

  const reconcileFromServer = useCallback(async () => {
    if (!domTarget || !settingsLoaded) {
      return;
    }

    try {
      const deviceId = selectedDeviceId;
      if (!deviceId) {
        return;
      }

      const entry = await fetchActiveSession(selectedSubRef.current, deviceId);
      if (!entry) {
        // Manual sessions are client-authoritative while in progress; a transient 404 on
        // /api/sessions/active must not clear local state (that unmounts video iframes).
        if (activeSessionRef.current?.mode === 'manual') {
          return;
        }

        if (activeSessionRef.current) {
          withRemoteSyncApply(() => {
            syncSessionFromRemote(null, deviceId);
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
        const snapshotDeviceId = entry.deviceId ?? deviceId;
        if (!snapshotDeviceId) {
          return;
        }

        await applySessionSnapshot({
          id: entry.id,
          startedAt: entry.startedAt,
          mode: entry.mode,
          subTarget: entry.subTarget,
          deviceId: snapshotDeviceId,
        });
      }
    } catch {
      // Ignore reconcile errors.
    }
  }, [applySessionSnapshot, domTarget, selectedDeviceId, settingsLoaded, syncSessionFromRemote]);

  useEffect(() => {
    return subscribeTabSync((message: TabSyncMessage) => {
      switch (message.type) {
        case 'session':
          void applySessionSnapshot(message.session);
          break;
        case 'device-session':
          if (!subTargetsMatch(message.subTarget, selectedSubRef.current)) {
            break;
          }
          void applySessionSnapshot(message.session, message.deviceId);
          break;
        case 'running':
          if (
            !('subTarget' in message) ||
            !('deviceId' in message) ||
            typeof message.deviceId !== 'string' ||
            !message.deviceId ||
            !('kind' in message) ||
            (message.kind !== 'relay' && message.kind !== 'motor')
          ) {
            break;
          }
          if (!subTargetsMatch(message.subTarget, selectedSubRef.current)) {
            break;
          }
          withRemoteSyncApply(() => {
            setDeviceAutomaticRunning(message.deviceId, message.kind, message.running);
          });
          break;
        case 'sub':
          if (message.subTarget !== selectedSubRef.current) {
            void (async () => {
              await endAllInProgressSessionsForSub('sub-change');
              withRemoteSyncApply(() => {
                applySubFromSync(message.subTarget);
              });
            })();
          }
          break;
        case 'command-lock': {
          const lockKeys =
            'lockKeys' in message && Array.isArray(message.lockKeys)
              ? message.lockKeys
              : 'keys' in message && Array.isArray((message as { keys?: string[] }).keys)
                ? (message as { keys: string[] }).keys
                : [];
          remoteLocksRef.current.set(message.tabId, new Set(lockKeys));
          mergeRemoteLocks();
          break;
        }
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
    endAllInProgressSessionsForSub,
    mergeRemoteLocks,
    setDeviceAutomaticRunning,
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

  const hasRemoteCommandLock = useCallback(
    (deviceId: string) => hasRemoteLockForDevice(remotePendingKeys, deviceId),
    [remotePendingKeys],
  );

  const isRemoteCommandPending = useCallback(
    (commandKey: HardwareCommandKey, deviceId: string) =>
      isRemoteLockForCommand(remotePendingKeys, deviceId, commandKey),
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
