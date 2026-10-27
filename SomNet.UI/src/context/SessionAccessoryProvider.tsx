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
  readSessionAccessoryInProgress,
  writeSessionAccessoryInProgress,
} from '@/utils/sessionAccessoryStorage';
import { readSubPresentAck } from '@/utils/subPresentAckStorage';
import { subTargetsMatch, writeReadyBannerDismissed } from '@/utils/readyBannerStorage';
import { useDeviceActuatorKind } from '@/hooks/useDeviceActuatorKind';
import { deviceAutomaticRunningForActuator } from '@/utils/deviceAutomaticRunning';

interface SessionAccessoryContextValue {
  sessionInProgress: boolean;
  togglePending: boolean;
  canEnableSwitch: boolean;
  switchDisabled: boolean;
  switchDisabledReason: string | undefined;
  /** Last failed session-accessory toggle (header switch or banner). */
  sessionAccessoryError: string;
  setSessionInProgress: (enabled: boolean) => Promise<void>;
}

const SessionAccessoryContext = createContext<SessionAccessoryContextValue | null>(null);

export function SessionAccessoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { mode } = useMode();
  const { selectedSub } = useSubTarget();
  const { status: systemStatus } = useSystemStatus();
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
  const actuatorKind = useDeviceActuatorKind(selectedSub);

  const domTarget = user?.displayName ?? user?.username ?? '';

  const [sessionInProgress, setSessionInProgressState] = useState(() =>
    domTarget ? readSessionAccessoryInProgress(domTarget, selectedSub) : false,
  );
  const [toggleError, setToggleError] = useState('');

  const activeSessionRef = useRef(activeSession);
  const settingsRef = useRef(settings);
  activeSessionRef.current = activeSession;
  settingsRef.current = settings;

  const togglePending = isCommandPending(HARDWARE_COMMAND_KEYS.sessionAccessory);

  const subPresentAcknowledged =
    readSubPresentAck(selectedSub) ||
    (subPresentAckSub !== null && subTargetsMatch(subPresentAckSub, selectedSub));

  const automaticDeviceRunning = deviceAutomaticRunningForActuator(
    settings,
    actuatorKind,
    settingsLoaded,
    settingsLoading,
  );

  const motionCommandPending =
    isCommandPending(HARDWARE_COMMAND_KEYS.manualStroke) ||
    isCommandPending(HARDWARE_COMMAND_KEYS.manualBurst) ||
    isCommandPending(HARDWARE_COMMAND_KEYS.automaticStart);

  const workInProgress =
    togglePending ||
    automaticDeviceRunning ||
    (sessionInProgress ? motionCommandPending : false);

  const canEnableSwitch =
    systemStatus.isReady && subPresentAcknowledged && !workInProgress;

  const switchDisabled =
    togglePending ||
    workInProgress ||
    (sessionInProgress ? false : !canEnableSwitch);

  const switchDisabledReason = useMemo(() => {
    if (toggleError) {
      return toggleError;
    }

    if (sessionInProgress && workInProgress) {
      return 'Wait for the current stroke or automatic run to finish, or press Abort.';
    }

    if (!sessionInProgress) {
      if (!systemStatus.isReady) {
        return systemStatus.detail || systemStatus.summary;
      }

      if (!subPresentAcknowledged) {
        return 'Sub must double-click the device button (ReportButtonEvent) before starting.';
      }

      if (automaticDeviceRunning) {
        return 'Stop the automatic run on this Sub before starting Session in Progress.';
      }

      if (settingsLoading || !settingsLoaded) {
        return 'Loading settings for this Sub…';
      }

      if (togglePending) {
        return 'Session command in progress…';
      }

      if (motionCommandPending) {
        return 'Wait for the current hardware command to finish.';
      }
    }

    return undefined;
  }, [
    automaticDeviceRunning,
    motionCommandPending,
    sessionInProgress,
    settingsLoaded,
    settingsLoading,
    subPresentAcknowledged,
    subPresentAckSub,
    selectedSub,
    systemStatus.detail,
    systemStatus.isReady,
    systemStatus.summary,
    toggleError,
    togglePending,
    workInProgress,
  ]);

  const persistInProgress = useCallback(
    (inProgress: boolean) => {
      if (!domTarget) {
        return;
      }

      writeSessionAccessoryInProgress(domTarget, selectedSub, inProgress);
      setSessionInProgressState(inProgress);

      if (inProgress) {
        dismissReadyBannerForSub(selectedSub);
      } else {
        writeReadyBannerDismissed(selectedSub, false);
      }

      if (shouldBroadcastLocalChange()) {
        postTabSync({
          type: 'session-accessory',
          tabId: getTabId(),
          inProgress,
          subTarget: selectedSub,
        });
      }
    },
    [dismissReadyBannerForSub, domTarget, selectedSub],
  );

  const applyRemoteInProgress = useCallback(
    (inProgress: boolean, subTarget: string) => {
      if (subTarget !== selectedSub) {
        return;
      }

      withRemoteSyncApply(() => {
        if (domTarget) {
          writeSessionAccessoryInProgress(domTarget, selectedSub, inProgress);
        }
        setSessionInProgressState(inProgress);

        if (inProgress) {
          dismissReadyBannerForSub(selectedSub);
        } else {
          writeReadyBannerDismissed(selectedSub, false);
        }
      });
    },
    [dismissReadyBannerForSub, domTarget, selectedSub],
  );

  useEffect(() => {
    return subscribeTabSync((message) => {
      if (message.type !== 'session-accessory') {
        return;
      }

      applyRemoteInProgress(message.inProgress, message.subTarget);
    });
  }, [applyRemoteInProgress]);

  useEffect(() => {
    if (!domTarget) {
      return;
    }

    setSessionInProgressState(readSessionAccessoryInProgress(domTarget, selectedSub));
  }, [domTarget, selectedSub]);

  useEffect(() => {
    if (!sessionInProgress || !mode || !activeSession) {
      return;
    }

    if (activeSession.mode !== mode) {
      void syncActiveSessionMode(mode);
    }
  }, [activeSession, mode, sessionInProgress, syncActiveSessionMode]);

  const setSessionInProgress = useCallback(
    async (enabled: boolean) => {
      setToggleError('');

      if (enabled && !mode) {
        setToggleError('Choose Manual or Automatic mode first.');
        return;
      }

      if (enabled) {
        dismissReadyBannerForSub(selectedSub);
      }

      const ran = await executeCommand(HARDWARE_COMMAND_KEYS.sessionAccessory, async () => {
        const payloadJson = JSON.stringify({ enabled });

        try {
          await sendHardwareCommand(selectedSub, HARDWARE_COMMAND_KEYS.sessionAccessory, payloadJson);

          if (enabled) {
            persistInProgress(true);
            try {
              await startSessionForAccessory(mode!);
            } catch (sessionError) {
              const message =
                sessionError instanceof Error
                  ? sessionError.message
                  : 'Could not create server session record.';
              setToggleError(
                `Session is on at the device, but the server session failed: ${message}`,
              );
            }
            return;
          }

          let automaticDeviceResult: AutomaticResultJson | null = null;

          const relayAutoRunning = settingsRef.current.automatic.running;
          const motorAutoRunning = settingsRef.current.motorAutomatic.running;

          if (
            activeSessionRef.current?.mode === 'automatic' ||
            relayAutoRunning ||
            motorAutoRunning
          ) {
            await stopAutomaticForModeSwitch(
              selectedSub,
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
                deviceSessionRunning: relayAutoRunning || motorAutoRunning,
                stopGraceMs: motorAutoRunning ? 60_000 : undefined,
              },
            );
          }

          const automaticDeviceStarted =
            activeSessionRef.current?.automaticDeviceStarted ?? false;

          await endSessionForAccessory({
            automaticDeviceStarted,
            automaticDeviceResult: automaticDeviceResult,
          });
          persistInProgress(false);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Could not update session accessory.';
          setToggleError(message);
          throw error;
        }
      });

      if (!ran) {
        setToggleError('Session command already in progress. Wait a moment and try again.');
      }
    },
    [
      dismissReadyBannerForSub,
      endSessionForAccessory,
      executeCommand,
      mode,
      persistInProgress,
      selectedSub,
      setAutomaticRunningLocal,
      setMotorAutomaticRunningLocal,
      startSessionForAccessory,
    ],
  );

  const value = useMemo(
    (): SessionAccessoryContextValue => ({
      sessionInProgress,
      togglePending,
      canEnableSwitch,
      switchDisabled,
      switchDisabledReason,
      sessionAccessoryError: toggleError,
      setSessionInProgress,
    }),
    [
      canEnableSwitch,
      sessionInProgress,
      setSessionInProgress,
      switchDisabled,
      switchDisabledReason,
      toggleError,
      togglePending,
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
