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
import { useDeviceOperationModeApi } from '@/context/DeviceOperationModeProvider';
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
  migrateSubSceneToDeviceIds,
  readDeviceAccessoryEngaged,
  readDeviceSceneSessionActive,
  writeDeviceAccessoryEngaged,
  writeDeviceSceneSessionActive,
} from '@/utils/sessionAccessoryStorage';
import { useDeviceActuatorKind } from '@/hooks/useDeviceActuatorKind';
import { deviceAutomaticRunningForActuator } from '@/utils/deviceAutomaticRunning';
import { migrateSubPresentAckToDeviceIds } from '@/utils/subPresentAckStorage';
import { writeReadyBannerDismissed } from '@/utils/readyBannerStorage';
import {
  isDeviceConnectionOnline,
  isHubLinkReady,
} from '@/utils/commandReadiness';

/** Operator gating follows Documents/34-Operator-Session-And-Accessory-V2-Rules.md (not P16 / V1). */

interface SessionAccessoryContextValue {
  /** Scene session for the selected device (V2). */
  sceneSessionActive: boolean;
  /** Session-accessory output for the selected device (`session-accessory` command). */
  accessoryEngaged: boolean;
  /** @deprecated Use accessoryEngaged */
  relayLockEngaged: boolean;
  /** @deprecated Use sceneSessionActive */
  sessionInProgress: boolean;
  sceneTogglePending: boolean;
  accessoryTogglePending: boolean;
  /** @deprecated Use accessoryTogglePending */
  relayTogglePending: boolean;
  sceneSwitchDisabled: boolean;
  accessorySwitchDisabled: boolean;
  /** @deprecated Use accessorySwitchDisabled */
  relaySwitchDisabled: boolean;
  sceneSwitchDisabledReason: string | undefined;
  accessorySwitchDisabledReason: string | undefined;
  /** @deprecated Use accessorySwitchDisabledReason */
  relaySwitchDisabledReason: string | undefined;
  sceneSessionError: string;
  accessoryError: string;
  /** @deprecated Use accessoryError */
  relayLockError: string;
  /** @deprecated Use sceneSessionError / accessoryError */
  sessionAccessoryError: string;
  setSceneSessionActive: (active: boolean) => Promise<void>;
  setAccessoryEngaged: (engaged: boolean) => Promise<void>;
  /** @deprecated Use setAccessoryEngaged */
  setRelayLockEngaged: (engaged: boolean) => Promise<void>;
  /** @deprecated Use setSceneSessionActive */
  setSessionInProgress: (enabled: boolean) => Promise<void>;
  ensureDeviceAccessoryOn: () => Promise<void>;
  /** @deprecated Use ensureDeviceAccessoryOn */
  ensureRelaySessionAccessoryOn: () => Promise<void>;
}

const SessionAccessoryContext = createContext<SessionAccessoryContextValue | null>(null);

export function SessionAccessoryProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { getDeviceOperationMode } = useDeviceOperationModeApi();
  const { selectedSub } = useSubTarget();
  const { relayRegistration, registrations, selectedDeviceId, selectedRegistration } = useSubDevice();
  const { status: systemStatus } = useSystemStatus();
  const { actuatorKind } = useDeviceActuatorKind();
  const { isDevicePresentAcknowledged, dismissReadyBannerForSub } = useSiteUserReady();
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
  const focusOperationMode =
    selectedDeviceId && selectedRegistration
      ? getDeviceOperationMode(selectedDeviceId, selectedRegistration.actuatorKind)
      : null;
  const [sceneSessionActive, setSceneSessionActiveState] = useState(() =>
    domTarget ? readDeviceSceneSessionActive(domTarget, selectedSub, selectedDeviceId) : false,
  );
  const [accessoryEngaged, setAccessoryEngagedState] = useState(() =>
    domTarget
      ? readDeviceAccessoryEngaged(domTarget, selectedSub, selectedDeviceId)
      : false,
  );
  const [sceneSessionError, setSceneSessionError] = useState('');
  const [accessoryError, setAccessoryError] = useState('');
  const [sceneTogglePending, setSceneTogglePending] = useState(false);

  const activeSessionRef = useRef(activeSession);
  const settingsRef = useRef(settings);
  const deviceAccessorySyncedKeyRef = useRef<string | null>(null);
  const wasSelectedDeviceOnlineRef = useRef(false);
  activeSessionRef.current = activeSession;
  settingsRef.current = settings;

  const accessoryTogglePending = isCommandPending(HARDWARE_COMMAND_KEYS.sessionAccessory);

  const subPresentAcknowledged = isDevicePresentAcknowledged(
    selectedSub,
    selectedDeviceId,
  );

  const selectedAutomaticRunning = deviceAutomaticRunningForActuator(
    settings,
    actuatorKind,
    settingsLoaded,
    settingsLoading,
  );

  const selectedDeviceOnline = isDeviceConnectionOnline(systemStatus);

  const motionCommandPending =
    isCommandPending(HARDWARE_COMMAND_KEYS.manualStroke) ||
    isCommandPending(HARDWARE_COMMAND_KEYS.manualBurst) ||
    isCommandPending(HARDWARE_COMMAND_KEYS.automaticStart);

  const hubLinkReady = isHubLinkReady(systemStatus);

  const canEnableScene =
    Boolean(selectedDeviceId) &&
    hubLinkReady &&
    subPresentAcknowledged &&
    !selectedAutomaticRunning &&
    !sceneTogglePending;

  const canEnableAccessory =
    sceneSessionActive &&
    hubLinkReady &&
    selectedDeviceOnline &&
    subPresentAcknowledged &&
    !accessoryTogglePending &&
    Boolean(selectedDeviceId) &&
    (!selectedAutomaticRunning || accessoryEngaged);

  const sceneWorkInProgress =
    sceneTogglePending ||
    (sceneSessionActive && (selectedAutomaticRunning || motionCommandPending));

  const sceneSwitchDisabled =
    sceneTogglePending ||
    (sceneSessionActive ? sceneWorkInProgress : !canEnableScene);

  const accessorySwitchDisabled =
    !selectedDeviceId ||
    accessoryTogglePending ||
    (accessoryEngaged ? selectedAutomaticRunning || accessoryTogglePending : !canEnableAccessory);

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
        return 'Double-click the selected device button before starting a scene session.';
      }
      if (!selectedDeviceId) {
        return 'Select a device to start a scene session.';
      }
      if (selectedAutomaticRunning) {
        return 'Stop the automatic run on this device before starting a scene session.';
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
    hubLinkReady,
    selectedAutomaticRunning,
    selectedDeviceId,
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

  const accessorySwitchDisabledReason = useMemo(() => {
    if (accessoryError) {
      return accessoryError;
    }

    if (!selectedDeviceId) {
      return 'Select a device to control accessory output.';
    }

    if (accessoryEngaged && selectedAutomaticRunning) {
      return 'Stop the automatic run on this device before turning Accessory off.';
    }

    if (!accessoryEngaged) {
      if (!sceneSessionActive) {
        return 'Turn Scene session on before Accessory.';
      }
      if (!hubLinkReady) {
        return systemStatus.detail || systemStatus.summary;
      }
      if (!selectedDeviceOnline) {
        return systemStatus.detail || systemStatus.summary || 'Device is not connected.';
      }
      if (!subPresentAcknowledged) {
        return 'Double-click the selected device button before using Accessory.';
      }
      if (accessoryTogglePending) {
        return 'Accessory command in progress…';
      }
    }

    return undefined;
  }, [
    accessoryEngaged,
    accessoryError,
    accessoryTogglePending,
    hubLinkReady,
    sceneSessionActive,
    selectedAutomaticRunning,
    selectedDeviceId,
    selectedDeviceOnline,
    subPresentAcknowledged,
    systemStatus.detail,
    systemStatus.summary,
  ]);

  const persistScene = useCallback(
    (deviceId: string, active: boolean) => {
      if (!domTarget) {
        return;
      }

      writeDeviceSceneSessionActive(domTarget, selectedSub, deviceId, active);
      if (deviceId === selectedDeviceId) {
        setSceneSessionActiveState(active);
      }

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
          deviceId,
        });
      }
    },
    [dismissReadyBannerForSub, domTarget, selectedDeviceId, selectedSub],
  );

  const persistAccessory = useCallback(
    (deviceId: string, engaged: boolean) => {
      if (!domTarget) {
        return;
      }

      writeDeviceAccessoryEngaged(domTarget, selectedSub, deviceId, engaged);
      setAccessoryEngagedState(engaged);
      if (!engaged) {
        deviceAccessorySyncedKeyRef.current = null;
      }

      if (shouldBroadcastLocalChange()) {
        postTabSync({
          type: 'device-accessory',
          tabId: getTabId(),
          engaged,
          subTarget: selectedSub,
          deviceId,
        });
      }
    },
    [domTarget, selectedSub],
  );

  const applyRemoteScene = useCallback(
    (active: boolean, subTarget: string, deviceId: string) => {
      if (subTarget !== selectedSub) {
        return;
      }

      withRemoteSyncApply(() => {
        if (domTarget) {
          writeDeviceSceneSessionActive(domTarget, selectedSub, deviceId, active);
        }
        if (deviceId === selectedDeviceId) {
          setSceneSessionActiveState(active);
        }
        if (active) {
          dismissReadyBannerForSub(selectedSub);
        } else {
          writeReadyBannerDismissed(selectedSub, false);
        }
      });
    },
    [dismissReadyBannerForSub, domTarget, selectedDeviceId, selectedSub],
  );

  const applyRemoteAccessory = useCallback(
    (engaged: boolean, subTarget: string, deviceId: string) => {
      if (subTarget !== selectedSub) {
        return;
      }

      withRemoteSyncApply(() => {
        if (domTarget) {
          writeDeviceAccessoryEngaged(domTarget, selectedSub, deviceId, engaged);
        }
        if (deviceId === selectedDeviceId) {
          setAccessoryEngagedState(engaged);
        }
        if (!engaged) {
          deviceAccessorySyncedKeyRef.current = null;
        }
      });
    },
    [domTarget, selectedDeviceId, selectedSub],
  );

  useEffect(() => {
    return subscribeTabSync((message) => {
      if (message.type === 'scene-session') {
        const sceneDeviceId =
          message.deviceId ?? relayRegistration?.deviceId ?? selectedDeviceId;
        if (sceneDeviceId) {
          applyRemoteScene(message.active, message.subTarget, sceneDeviceId);
        }
        return;
      }
      if (message.type === 'device-accessory') {
        applyRemoteAccessory(message.engaged, message.subTarget, message.deviceId);
        return;
      }
      if (message.type === 'relay-lock') {
        if (relayRegistration?.deviceId) {
          applyRemoteAccessory(message.engaged, message.subTarget, relayRegistration.deviceId);
        }
        return;
      }
      if (message.type === 'session-accessory') {
        const legacyDeviceId = relayRegistration?.deviceId ?? selectedDeviceId;
        if (legacyDeviceId) {
          applyRemoteScene(message.inProgress, message.subTarget, legacyDeviceId);
          applyRemoteAccessory(message.inProgress, message.subTarget, legacyDeviceId);
        }
      }
    });
  }, [
    applyRemoteAccessory,
    applyRemoteScene,
    relayRegistration?.deviceId,
    selectedDeviceId,
  ]);

  useEffect(() => {
    if (!domTarget || registrations.length === 0) {
      return;
    }

    migrateSubSceneToDeviceIds(
      domTarget,
      selectedSub,
      registrations.map((row) => row.deviceId),
    );
    migrateSubPresentAckToDeviceIds(
      selectedSub,
      registrations.map((row) => row.deviceId),
    );
  }, [domTarget, registrations, selectedSub]);

  useEffect(() => {
    if (!domTarget) {
      return;
    }

    setSceneSessionActiveState(
      readDeviceSceneSessionActive(domTarget, selectedSub, selectedDeviceId),
    );
  }, [domTarget, selectedDeviceId, selectedSub]);

  useEffect(() => {
    if (!domTarget) {
      return;
    }

    setAccessoryEngagedState(
      readDeviceAccessoryEngaged(domTarget, selectedSub, selectedDeviceId),
    );
    deviceAccessorySyncedKeyRef.current = null;
    wasSelectedDeviceOnlineRef.current = false;
  }, [domTarget, selectedDeviceId, selectedSub]);

  useEffect(() => {
    setSceneSessionError('');
    setAccessoryError('');
    deviceAccessorySyncedKeyRef.current = null;
  }, [selectedSub, selectedDeviceId]);

  /** Re-send accessory ON when UI thinks it is on (e.g. device reconnect). No-op if Accessory is off. */
  const ensureDeviceAccessoryOn = useCallback(async () => {
    const deviceId = selectedDeviceId;
    if (!deviceId || !accessoryEngaged) {
      return;
    }

    deviceAccessorySyncedKeyRef.current = null;
    await sendHardwareCommand(
      selectedSub,
      deviceId,
      HARDWARE_COMMAND_KEYS.sessionAccessory,
      JSON.stringify({ enabled: true }),
    );
    deviceAccessorySyncedKeyRef.current = `${selectedSub}:${deviceId}`;
  }, [accessoryEngaged, selectedDeviceId, selectedSub]);

  useEffect(() => {
    if (!accessoryEngaged || !selectedDeviceId) {
      deviceAccessorySyncedKeyRef.current = null;
      wasSelectedDeviceOnlineRef.current = false;
      return;
    }

    if (!hubLinkReady || !sceneSessionActive) {
      return;
    }

    if (!selectedDeviceOnline) {
      wasSelectedDeviceOnlineRef.current = false;
      return;
    }

    const syncKey = `${selectedSub}:${selectedDeviceId}`;
    const justConnected = !wasSelectedDeviceOnlineRef.current;
    wasSelectedDeviceOnlineRef.current = true;

    if (!justConnected && deviceAccessorySyncedKeyRef.current === syncKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      void sendHardwareCommand(
        selectedSub,
        selectedDeviceId,
        HARDWARE_COMMAND_KEYS.sessionAccessory,
        JSON.stringify({ enabled: true }),
      )
        .then(() => {
          deviceAccessorySyncedKeyRef.current = syncKey;
        })
        .catch(() => {
          deviceAccessorySyncedKeyRef.current = null;
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    accessoryEngaged,
    hubLinkReady,
    sceneSessionActive,
    selectedDeviceId,
    selectedDeviceOnline,
    selectedSub,
  ]);

  useEffect(() => {
    if (!sceneSessionActive || !focusOperationMode || !activeSession) {
      return;
    }

    if (activeSession.mode !== focusOperationMode) {
      void syncActiveSessionMode(focusOperationMode);
    }
  }, [activeSession, focusOperationMode, sceneSessionActive, syncActiveSessionMode]);

  const stopAutomaticOnSelectedDevice = useCallback(async (): Promise<AutomaticResultJson | null> => {
    const deviceId = selectedDeviceId;
    if (!deviceId) {
      return null;
    }

    const motor = actuatorKind === 'hbridge';
    const relayAutoRunning = settingsRef.current.automatic.running;
    const motorAutoRunning = settingsRef.current.motorAutomatic.running;
    const deviceSessionRunning = motor ? motorAutoRunning : relayAutoRunning;

    if (
      activeSessionRef.current?.mode !== 'automatic' &&
      !deviceSessionRunning
    ) {
      return null;
    }

    let automaticDeviceResult: AutomaticResultJson | null = null;

    await stopAutomaticForModeSwitch(
      selectedSub,
      deviceId,
      settingsRef.current.automatic,
      {
        endAutomaticSession: async (_endReason, deviceResult) => {
          automaticDeviceResult = deviceResult ?? null;
        },
        setAutomaticRunningLocal: (running) => {
          if (motor) {
            setMotorAutomaticRunningLocal(running);
          } else {
            setAutomaticRunningLocal(running);
          }
        },
        isAutomaticSessionActive: () =>
          activeSessionRef.current?.mode === 'automatic' || deviceSessionRunning,
      },
      {
        deviceSessionRunning,
        stopGraceMs: motor ? 60_000 : undefined,
      },
    );

    return automaticDeviceResult;
  }, [
    actuatorKind,
    selectedDeviceId,
    selectedSub,
    setAutomaticRunningLocal,
    setMotorAutomaticRunningLocal,
  ]);

  const turnOffAccessoryForDevice = useCallback(
    async (deviceId: string) => {
      if (!domTarget) {
        return;
      }

      if (!readDeviceAccessoryEngaged(domTarget, selectedSub, deviceId)) {
        return;
      }

      try {
        await sendHardwareCommand(
          selectedSub,
          deviceId,
          HARDWARE_COMMAND_KEYS.sessionAccessory,
          JSON.stringify({ enabled: false }),
        );
      } catch {
        // Best-effort when ending scene session.
      }
      writeDeviceAccessoryEngaged(domTarget, selectedSub, deviceId, false);
      if (deviceId === selectedDeviceId) {
        setAccessoryEngagedState(false);
        deviceAccessorySyncedKeyRef.current = null;
      }
    },
    [domTarget, selectedDeviceId, selectedSub],
  );

  const setSceneSessionActive = useCallback(
    async (active: boolean) => {
      setSceneSessionError('');

      if (active && !focusOperationMode) {
        setSceneSessionError('Choose Manual or Automatic for this device first.');
        return;
      }

      const deviceId = selectedDeviceId;
      if (!deviceId) {
        setSceneSessionError('Select a device to start or end a scene session.');
        return;
      }

      if (active) {
        dismissReadyBannerForSub(selectedSub);
      }

      setSceneTogglePending(true);
      try {
        if (active) {
          persistScene(deviceId, true);
          try {
            await startSessionForAccessory(focusOperationMode!, deviceId);
          } catch (sessionError) {
            const message =
              sessionError instanceof Error
                ? sessionError.message
                : 'Could not create server session record.';
            setSceneSessionError(message);
          }
          return;
        }

        const automaticDeviceResult = await stopAutomaticOnSelectedDevice();
        const automaticDeviceStarted =
          activeSessionRef.current?.automaticDeviceStarted ?? false;

        await endSessionForAccessory({
          automaticDeviceStarted,
          automaticDeviceResult: automaticDeviceResult,
        });
        await turnOffAccessoryForDevice(deviceId);
        persistScene(deviceId, false);
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
      focusOperationMode,
      persistScene,
      selectedSub,
      selectedDeviceId,
      startSessionForAccessory,
      stopAutomaticOnSelectedDevice,
      turnOffAccessoryForDevice,
    ],
  );

  const setAccessoryEngaged = useCallback(
    async (engaged: boolean) => {
      setAccessoryError('');

      const deviceId = selectedDeviceId;
      if (!deviceId) {
        setAccessoryError('Select a device to control Accessory.');
        return;
      }

      if (engaged && !sceneSessionActive) {
        setAccessoryError('Turn Scene session on before Accessory.');
        return;
      }

      const ran = await executeCommand(HARDWARE_COMMAND_KEYS.sessionAccessory, async () => {
        try {
          if (engaged) {
            await sendHardwareCommand(
              selectedSub,
              deviceId,
              HARDWARE_COMMAND_KEYS.sessionAccessory,
              JSON.stringify({ enabled: true }),
            );
            deviceAccessorySyncedKeyRef.current = `${selectedSub}:${deviceId}`;
            persistAccessory(deviceId, true);
            return;
          }

          await sendHardwareCommand(
            selectedSub,
            deviceId,
            HARDWARE_COMMAND_KEYS.sessionAccessory,
            JSON.stringify({ enabled: false }),
          );
          deviceAccessorySyncedKeyRef.current = null;
          persistAccessory(deviceId, false);
        } catch (error) {
          const message =
            error instanceof Error ? error.message : 'Could not update accessory output.';
          setAccessoryError(message);
          throw error;
        }
      });

      if (!ran) {
        setAccessoryError('Accessory command already in progress. Wait a moment and try again.');
      }
    },
    [executeCommand, persistAccessory, sceneSessionActive, selectedDeviceId, selectedSub],
  );

  const setSessionInProgress = useCallback(
    async (enabled: boolean) => {
      await setSceneSessionActive(enabled);
    },
    [setSceneSessionActive],
  );

  const value = useMemo(
    (): SessionAccessoryContextValue => ({
      sceneSessionActive,
      accessoryEngaged,
      relayLockEngaged: accessoryEngaged,
      sessionInProgress: sceneSessionActive,
      sceneTogglePending,
      accessoryTogglePending,
      relayTogglePending: accessoryTogglePending,
      sceneSwitchDisabled,
      accessorySwitchDisabled,
      relaySwitchDisabled: accessorySwitchDisabled,
      sceneSwitchDisabledReason,
      accessorySwitchDisabledReason,
      relaySwitchDisabledReason: accessorySwitchDisabledReason,
      sceneSessionError,
      accessoryError,
      relayLockError: accessoryError,
      sessionAccessoryError: accessoryError || sceneSessionError,
      setSceneSessionActive,
      setAccessoryEngaged,
      setRelayLockEngaged: setAccessoryEngaged,
      setSessionInProgress,
      ensureDeviceAccessoryOn,
      ensureRelaySessionAccessoryOn: ensureDeviceAccessoryOn,
    }),
    [
      accessoryEngaged,
      accessoryError,
      accessorySwitchDisabled,
      accessorySwitchDisabledReason,
      accessoryTogglePending,
      ensureDeviceAccessoryOn,
      sceneSessionActive,
      sceneSessionError,
      sceneSwitchDisabled,
      sceneSwitchDisabledReason,
      sceneTogglePending,
      setAccessoryEngaged,
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
