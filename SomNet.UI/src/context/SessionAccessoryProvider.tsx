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
import { useAuth } from '@/context/AuthProvider';
import { useMode } from '@/context/ModeProvider';
import { useOptions } from '@/context/OptionsProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { useSystemStatus } from '@/context/SystemStatusProvider';
import { useSiteUserReady } from '@/context/SiteUserReadyProvider';
import { useHardwareCommand } from '@/context/HardwareCommandProvider';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { sendHardwareCommand } from '@/services/hardwareCommand';
import type { AutomaticResultJson } from '@/utils/automaticResultJson';
import { stopAutomaticForModeSwitch } from '@/utils/stopAutomaticForModeSwitch';
import {
  getTabId,
  postTabSync,
  shouldBroadcastLocalChange,
  subscribeTabSync,
  withRemoteSyncApply,
} from '@/utils/tabSync';
import {
  readRelayLockEngaged,
  readSceneSessionActive,
  writeRelayLockEngaged,
  writeSceneSessionActive,
} from '@/utils/sessionAccessoryStorage';
import { readSubPresentAck } from '@/utils/subPresentAckStorage';
import { subTargetsMatch, writeReadyBannerDismissed } from '@/utils/readyBannerStorage';
import {
  isDeviceConnectionOnline,
  isHubLinkReady,
} from '@/utils/commandReadiness';

interface SessionAccessoryContextValue {
  /** Sub scene / server session / video (one per Sub). */
  sceneSessionActive: boolean;
  /** Relay ESP session-accessory GPIO (relay device only). */
  relayLockEngaged: boolean;
  /** @deprecated Use sceneSessionActive */
  sessionInProgress: boolean;
  sceneTogglePending: boolean;
  relayTogglePending: boolean;
  sceneSwitchDisabled: boolean;
  relaySwitchDisabled: boolean;
  sceneSwitchDisabledReason: string | undefined;
  relaySwitchDisabledReason: string | undefined;
  sceneSessionError: string;
  relayLockError: string;
  /** @deprecated Use sceneSessionError / relayLockError */
  sessionAccessoryError: string;
  setSceneSessionActive: (active: boolean) => Promise<void>;
  setRelayLockEngaged: (engaged: boolean) => Promise<void>;
  /** @deprecated Use setSceneSessionActive */
  setSessionInProgress: (enabled: boolean) => Promise<void>;
  ensureRelaySessionAccessoryOn: () => Promise<void>;
}

const SessionAccessoryContext = createContext<SessionAccessoryContextValue | null>(null);

export function SessionAccessoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { mode } = useMode();
  const { selectedSub } = useSubTarget();
  const { relayRegistration, registrations, selectedDeviceId } = useSubDevice();
  const { status: systemStatus, relayStatus } = useSystemStatus();
  const { subPresentAckSub, dismissReadyBannerForSub } = useSiteUserReady();
  const {
    settings,
    settingsLoaded,
    isLoading: settingsLoading,
    setAutomaticRunningLocal,
    setMotorAutomaticRunningLocal,
  } = useOptions();
  const {
    activeSession,
    startSessionForAccessory,
    endSessionForAccessory,
    syncActiveSessionMode,
  } = useLiveSession();
  const { isCommandPending, executeCommand } = useHardwareCommand();

  const domTarget = user?.displayName ?? user?.username ?? '';
  const relayDeviceId = relayRegistration?.deviceId ?? null;

  const [sceneSessionActive, setSceneSessionActiveState] = useState(() =>
    domTarget ? readSceneSessionActive(domTarget, selectedSub) : false,
  );
  const [relayLockEngaged, setRelayLockEngagedState] = useState(() =>
    domTarget ? readRelayLockEngaged(domTarget, selectedSub, relayDeviceId) : false,
  );
  const [sceneSessionError, setSceneSessionError] = useState('');
  const [relayLockError, setRelayLockError] = useState('');
  const [sceneTogglePending, setSceneTogglePending] = useState(false);

  const activeSessionRef = useRef(activeSession);
  const settingsRef = useRef(settings);
  const relayAccessorySyncedKeyRef = useRef<string | null>(null);
  const wasRelayOnlineRef = useRef(false);
  activeSessionRef.current = activeSession;
  settingsRef.current = settings;

  const relayTogglePending = isCommandPending(HARDWARE_COMMAND_KEYS.sessionAccessory);

  const subPresentAcknowledged =
    readSubPresentAck(selectedSub) ||
    (subPresentAckSub !== null && subTargetsMatch(subPresentAckSub, selectedSub));

  const anyAutomaticRunningOnSub =
    settingsLoaded &&
    !settingsLoading &&
    (settings.automatic.running || settings.motorAutomatic.running);

  const relayAutoRunning = settingsLoaded && !settingsLoading && settings.automatic.running;

  const motionCommandPending =
    isCommandPending(HARDWARE_COMMAND_KEYS.manualStroke) ||
    isCommandPending(HARDWARE_COMMAND_KEYS.manualBurst) ||
    isCommandPending(HARDWARE_COMMAND_KEYS.automaticStart);

  const relayConnectionSnapshot =
    relayRegistration && relayRegistration.deviceId !== selectedDeviceId
      ? relayStatus
      : systemStatus;

  const hubLinkReady = isHubLinkReady(systemStatus);

  const relayDeviceOnline = relayRegistration
    ? relayConnectionSnapshot !== null && isDeviceConnectionOnline(relayConnectionSnapshot)
    : isDeviceConnectionOnline(systemStatus);

  const canEnableScene =
    hubLinkReady && subPresentAcknowledged && !anyAutomaticRunningOnSub && !sceneTogglePending;

  const canEnableRelayLock =
    hubLinkReady &&
    relayDeviceOnline &&
    subPresentAcknowledged &&
    !relayTogglePending &&
    (!relayAutoRunning || relayLockEngaged);

  const sceneWorkInProgress =
    sceneTogglePending ||
    (sceneSessionActive && (anyAutomaticRunningOnSub || motionCommandPending));

  const sceneSwitchDisabled =
    sceneTogglePending ||
    (sceneSessionActive ? sceneWorkInProgress : !canEnableScene);

  const relaySwitchDisabled =
    !relayRegistration ||
    relayTogglePending ||
    (relayLockEngaged ? relayAutoRunning || relayTogglePending : !canEnableRelayLock);

  const sceneSwitchDisabledReason = useMemo(() => {
    if (sceneSessionError) {
      return sceneSessionError;
    }

    if (sceneSessionActive && sceneWorkInProgress) {
      return 'Wait for the current run or command to finish before ending the scene session.';
    }

    if (!sceneSessionActive) {
      if (!hubLinkReady) {
        return systemStatus.detail || systemStatus.summary;
      }
      if (!subPresentAcknowledged) {
        return 'Sub must double-click the device button before starting a scene session.';
      }
      if (anyAutomaticRunningOnSub) {
        return 'Stop automatic runs on this Sub before starting a scene session.';
      }
      if (settingsLoading || !settingsLoaded) {
        return 'Loading settings for this Sub…';
      }
      if (sceneTogglePending) {
        return 'Scene session command in progress…';
      }
    }

    return undefined;
  }, [
    anyAutomaticRunningOnSub,
    hubLinkReady,
    sceneSessionActive,
    sceneSessionError,
    sceneTogglePending,
    sceneWorkInProgress,
    settingsLoaded,
    settingsLoading,
    subPresentAcknowledged,
    systemStatus.detail,
    systemStatus.summary,
  ]);

  const relaySwitchDisabledReason = useMemo(() => {
    if (relayLockError) {
      return relayLockError;
    }

    if (!relayRegistration) {
      return undefined;
    }

    if (relayLockEngaged && relayAutoRunning) {
      return 'Stop the relay automatic run before turning Relay lock off.';
    }

    if (!relayLockEngaged) {
      if (!hubLinkReady) {
        return systemStatus.detail || systemStatus.summary;
      }
      if (!relayDeviceOnline) {
        return (
          relayConnectionSnapshot?.detail ||
          relayConnectionSnapshot?.summary ||
          'Relay device is not connected.'
        );
      }
      if (!subPresentAcknowledged) {
        return 'Sub must double-click the device button before engaging Relay lock.';
      }
      if (relayTogglePending) {
        return 'Relay lock command in progress…';
      }
    }

    return undefined;
  }, [
    hubLinkReady,
    relayAutoRunning,
    relayConnectionSnapshot?.detail,
    relayConnectionSnapshot?.summary,
    relayDeviceOnline,
    relayLockEngaged,
    relayLockError,
    relayRegistration,
    relayTogglePending,
    subPresentAcknowledged,
    systemStatus.detail,
    systemStatus.summary,
  ]);

  const persistScene = useCallback(
    (active: boolean) => {
      if (!domTarget) {
        return;
      }

      writeSceneSessionActive(domTarget, selectedSub, active);
      setSceneSessionActiveState(active);

      if (active) {
        dismissReadyBannerForSub(selectedSub);
      } else {
        writeReadyBannerDismissed(selectedSub, false);
      }

      if (shouldBroadcastLocalChange()) {
        postTabSync({
          type: 'scene-session',
          tabId: getTabId(),
          active,
          subTarget: selectedSub,
        });
      }
    },
    [dismissReadyBannerForSub, domTarget, selectedSub],
  );

  const persistRelayLock = useCallback(
    (engaged: boolean) => {
      if (!domTarget) {
        return;
      }

      writeRelayLockEngaged(domTarget, selectedSub, engaged, relayRegistration?.deviceId ?? null);
      setRelayLockEngagedState(engaged);
      if (!engaged) {
        relayAccessorySyncedKeyRef.current = null;
      }

      if (shouldBroadcastLocalChange()) {
        postTabSync({
          type: 'relay-lock',
          tabId: getTabId(),
          engaged,
          subTarget: selectedSub,
        });
      }
    },
    [domTarget, relayRegistration?.deviceId, selectedSub],
  );

  const applyRemoteScene = useCallback(
    (active: boolean, subTarget: string) => {
      if (subTarget !== selectedSub) {
        return;
      }

      withRemoteSyncApply(() => {
        if (domTarget) {
          writeSceneSessionActive(domTarget, selectedSub, active);
        }
        setSceneSessionActiveState(active);
        if (active) {
          dismissReadyBannerForSub(selectedSub);
        } else {
          writeReadyBannerDismissed(selectedSub, false);
        }
      });
    },
    [dismissReadyBannerForSub, domTarget, selectedSub],
  );

  const applyRemoteRelayLock = useCallback(
    (engaged: boolean, subTarget: string) => {
      if (subTarget !== selectedSub) {
        return;
      }

      withRemoteSyncApply(() => {
        if (domTarget) {
          writeRelayLockEngaged(
            domTarget,
            selectedSub,
            engaged,
            relayRegistration?.deviceId ?? null,
          );
        }
        setRelayLockEngagedState(engaged);
        if (!engaged) {
          relayAccessorySyncedKeyRef.current = null;
        }
      });
    },
    [domTarget, relayRegistration?.deviceId, selectedSub],
  );

  useEffect(() => {
    return subscribeTabSync((message) => {
      if (message.type === 'scene-session') {
        applyRemoteScene(message.active, message.subTarget);
        return;
      }
      if (message.type === 'relay-lock') {
        applyRemoteRelayLock(message.engaged, message.subTarget);
        return;
      }
      if (message.type === 'session-accessory') {
        applyRemoteScene(message.inProgress, message.subTarget);
        applyRemoteRelayLock(message.inProgress, message.subTarget);
      }
    });
  }, [applyRemoteRelayLock, applyRemoteScene]);

  useEffect(() => {
    if (!domTarget) {
      return;
    }

    setSceneSessionActiveState(readSceneSessionActive(domTarget, selectedSub));
    setRelayLockEngagedState(readRelayLockEngaged(domTarget, selectedSub, relayDeviceId));
    relayAccessorySyncedKeyRef.current = null;
  }, [domTarget, relayDeviceId, selectedSub]);

  useEffect(() => {
    setSceneSessionError('');
    setRelayLockError('');
    relayAccessorySyncedKeyRef.current = null;
  }, [selectedSub, selectedDeviceId]);

  const ensureRelaySessionAccessoryOn = useCallback(async () => {
    const relayId = relayRegistration?.deviceId;
    if (!relayId) {
      return;
    }

    if (!relayLockEngaged) {
      throw new Error('Turn Relay lock on before relay commands.');
    }

    relayAccessorySyncedKeyRef.current = null;
    await sendHardwareCommand(
      selectedSub,
      relayId,
      HARDWARE_COMMAND_KEYS.sessionAccessory,
      JSON.stringify({ enabled: true }),
    );
    relayAccessorySyncedKeyRef.current = `${selectedSub}:${relayId}`;
  }, [relayLockEngaged, relayRegistration?.deviceId, selectedSub]);

  useEffect(() => {
    if (!relayLockEngaged) {
      relayAccessorySyncedKeyRef.current = null;
      wasRelayOnlineRef.current = false;
      return;
    }

    const relayId = relayRegistration?.deviceId;
    if (!relayId || !hubLinkReady) {
      return;
    }

    if (!relayDeviceOnline) {
      wasRelayOnlineRef.current = false;
      return;
    }

    const syncKey = `${selectedSub}:${relayId}`;
    const justConnected = !wasRelayOnlineRef.current;
    wasRelayOnlineRef.current = true;

    if (!justConnected && relayAccessorySyncedKeyRef.current === syncKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      void sendHardwareCommand(
        selectedSub,
        relayId,
        HARDWARE_COMMAND_KEYS.sessionAccessory,
        JSON.stringify({ enabled: true }),
      )
        .then(() => {
          relayAccessorySyncedKeyRef.current = syncKey;
        })
        .catch(() => {
          relayAccessorySyncedKeyRef.current = null;
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [hubLinkReady, relayDeviceOnline, relayLockEngaged, relayRegistration?.deviceId, selectedSub]);

  useEffect(() => {
    if (!sceneSessionActive || !mode || !activeSession) {
      return;
    }

    if (activeSession.mode !== mode) {
      void syncActiveSessionMode(mode);
    }
  }, [activeSession, mode, sceneSessionActive, syncActiveSessionMode]);

  const stopAllAutomaticOnSub = useCallback(async (): Promise<AutomaticResultJson | null> => {
    let automaticDeviceResult: AutomaticResultJson | null = null;
    const relayAutoRunning = settingsRef.current.automatic.running;
    const motorAutoRunning = settingsRef.current.motorAutomatic.running;

    const stopTargets: {
      deviceId: string;
      automatic: typeof settingsRef.current.automatic;
      motor: boolean;
    }[] = [];

    if (relayAutoRunning && relayRegistration?.deviceId) {
      stopTargets.push({
        deviceId: relayRegistration.deviceId,
        automatic: settingsRef.current.automatic,
        motor: false,
      });
    }
    if (motorAutoRunning) {
      for (const reg of registrations.filter((row) => row.actuatorKind === 'hbridge')) {
        stopTargets.push({
          deviceId: reg.deviceId,
          automatic: settingsRef.current.automatic,
          motor: true,
        });
      }
    }

    if (
      activeSessionRef.current?.mode === 'automatic' ||
      relayAutoRunning ||
      motorAutoRunning
    ) {
      for (const target of stopTargets) {
        await stopAutomaticForModeSwitch(
          selectedSub,
          target.deviceId,
          settingsRef.current.automatic,
          {
            endAutomaticSession: async (_endReason, deviceResult) => {
              automaticDeviceResult = deviceResult ?? null;
            },
            setAutomaticRunningLocal: (running) => {
              setAutomaticRunningLocal(running);
              if (!running) {
                setMotorAutomaticRunningLocal(false);
              }
            },
            isAutomaticSessionActive: () =>
              activeSessionRef.current?.mode === 'automatic' ||
              settingsRef.current.automatic.running ||
              settingsRef.current.motorAutomatic.running,
          },
          {
            deviceSessionRunning: target.motor ? motorAutoRunning : relayAutoRunning,
            stopGraceMs: target.motor ? 60_000 : undefined,
          },
        );
      }
    }

    return automaticDeviceResult;
  }, [
    registrations,
    relayRegistration?.deviceId,
    selectedSub,
    setAutomaticRunningLocal,
    setMotorAutomaticRunningLocal,
  ]);

  const setSceneSessionActive = useCallback(
    async (active: boolean) => {
      setSceneSessionError('');

      if (active && !mode) {
        setSceneSessionError('Choose Manual or Automatic mode first.');
        return;
      }

      if (active) {
        dismissReadyBannerForSub(selectedSub);
      }

      setSceneTogglePending(true);
      try {
        if (active) {
          persistScene(true);
          try {
            await startSessionForAccessory(mode!);
          } catch (sessionError) {
            const message =
              sessionError instanceof Error
                ? sessionError.message
                : 'Could not create server session record.';
            setSceneSessionError(message);
          }
          return;
        }

        const automaticDeviceResult = await stopAllAutomaticOnSub();
        const automaticDeviceStarted =
          activeSessionRef.current?.automaticDeviceStarted ?? false;

        await endSessionForAccessory({
          automaticDeviceStarted,
          automaticDeviceResult: automaticDeviceResult,
        });
        persistScene(false);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Could not update scene session.';
        setSceneSessionError(message);
      } finally {
        setSceneTogglePending(false);
      }
    },
    [
      dismissReadyBannerForSub,
      endSessionForAccessory,
      mode,
      persistScene,
      selectedSub,
      startSessionForAccessory,
      stopAllAutomaticOnSub,
    ],
  );

  const setRelayLockEngaged = useCallback(
    async (engaged: boolean) => {
      setRelayLockError('');

      const relayId = relayRegistration?.deviceId;
      if (!relayId) {
        setRelayLockError('No relay device paired on this Sub.');
        return;
      }

      const ran = await executeCommand(HARDWARE_COMMAND_KEYS.sessionAccessory, async () => {
        try {
          if (engaged) {
            await sendHardwareCommand(
              selectedSub,
              relayId,
              HARDWARE_COMMAND_KEYS.sessionAccessory,
              JSON.stringify({ enabled: true }),
            );
            relayAccessorySyncedKeyRef.current = `${selectedSub}:${relayId}`;
            persistRelayLock(true);
            return;
          }

          await sendHardwareCommand(
            selectedSub,
            relayId,
            HARDWARE_COMMAND_KEYS.sessionAccessory,
            JSON.stringify({ enabled: false }),
          );
          relayAccessorySyncedKeyRef.current = null;
          persistRelayLock(false);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Could not update relay lock.';
          setRelayLockError(message);
          throw error;
        }
      });

      if (!ran) {
        setRelayLockError('Relay lock command already in progress. Wait a moment and try again.');
      }
    },
    [executeCommand, persistRelayLock, relayRegistration?.deviceId, selectedSub],
  );

  const setSessionInProgress = useCallback(
    async (enabled: boolean) => {
      await setSceneSessionActive(enabled);
      if (relayRegistration?.deviceId) {
        await setRelayLockEngaged(enabled);
      }
    },
    [relayRegistration?.deviceId, setRelayLockEngaged, setSceneSessionActive],
  );

  const value = useMemo(
    (): SessionAccessoryContextValue => ({
      sceneSessionActive,
      relayLockEngaged,
      sessionInProgress: sceneSessionActive,
      sceneTogglePending,
      relayTogglePending,
      sceneSwitchDisabled,
      relaySwitchDisabled,
      sceneSwitchDisabledReason,
      relaySwitchDisabledReason,
      sceneSessionError,
      relayLockError,
      sessionAccessoryError: relayLockError || sceneSessionError,
      setSceneSessionActive,
      setRelayLockEngaged,
      setSessionInProgress,
      ensureRelaySessionAccessoryOn,
    }),
    [
      ensureRelaySessionAccessoryOn,
      relayLockEngaged,
      relayLockError,
      relaySwitchDisabled,
      relaySwitchDisabledReason,
      relayTogglePending,
      sceneSessionActive,
      sceneSessionError,
      sceneSwitchDisabled,
      sceneSwitchDisabledReason,
      sceneTogglePending,
      setRelayLockEngaged,
      setSceneSessionActive,
      setSessionInProgress,
    ],
  );

  return (
    <SessionAccessoryContext.Provider value={value}>{children}</SessionAccessoryContext.Provider>
  );
}

export function useSessionAccessory(): SessionAccessoryContextValue {
  const context = useContext(SessionAccessoryContext);
  if (!context) {
    throw new Error('useSessionAccessory must be used within SessionAccessoryProvider');
  }
  return context;
}
