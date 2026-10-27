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
import { fetchPairingSettings, fetchStrokeLimits, savePairingSettings } from '@/api/settings';
import { useAuth } from '@/context/AuthProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { DEFAULT_STROKE_MS_LIMITS } from '@/config/strokeLimits';
import type { AppOptions } from '@/types/options';
import type { AutomaticControlState, ManualControlState } from '@/types/modes';
import { DEFAULT_PAIRING_SETTINGS, type PairingSettings } from '@/types/pairingSettings';
import type { StrokeMsLimits } from '@/utils/strokeMsLimits';
import { normalizeStrokeMsPair } from '@/utils/strokeMsLimits';
import { normalizeAutomaticControlState } from '@/utils/automaticFieldRules';
import { normalizeMotorAutomaticControlState } from '@/utils/motorAutomaticFieldRules';
import type { MotorAutomaticControlState } from '@/types/motorModes';
import { clearAutomaticDeviceRunningHint } from '@/utils/automaticDeviceRunningHint';
import {
  readDeviceAutomaticRunningLocal,
  writeDeviceAutomaticRunningLocal,
} from '@/utils/deviceAutomaticRunningLocal';
import { cacheDeviceSettings } from '@/utils/deviceSettingsCache';
import {
  automaticRunningKindForActuator,
  getTabId,
  postTabSync,
  shouldBroadcastLocalChange,
  type AutomaticRunningKind,
} from '@/utils/tabSync';

interface OptionsContextValue {
  settings: PairingSettings;
  options: AppOptions;
  strokeLimits: StrokeMsLimits;
  isLoading: boolean;
  /** True after pairing settings were fetched for the current Dom/Sub. */
  settingsLoaded: boolean;
  setOptions: (options: AppOptions) => Promise<void>;
  updateManual: (manual: ManualControlState) => void;
  updateAutomatic: (automatic: AutomaticControlState) => void;
  updateMotorAutomatic: (motorAutomatic: MotorAutomaticControlState) => void;
  /** Set running flag locally without persisting (session rehydration). */
  setAutomaticRunningLocal: (running: boolean) => void;
  setMotorAutomaticRunningLocal: (running: boolean) => void;
  /** Update running for any device (hub / cross-device); syncs UI only when selected. */
  setDeviceAutomaticRunning: (
    deviceId: string,
    kind: AutomaticRunningKind,
    running: boolean,
  ) => void;
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const OptionsContext = createContext<OptionsContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 400;

export function OptionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const {
    selectedDeviceId,
    selectedActuatorKind,
    registrations,
    isLoading: devicesLoading,
  } = useSubDevice();
  const selectedSubRef = useRef(selectedSub);
  selectedSubRef.current = selectedSub;
  const persistDeviceIdRef = useRef<string | null>(null);
  const domTarget = user?.displayName ?? user?.username ?? '';
  const [settings, setSettings] = useState<PairingSettings>(DEFAULT_PAIRING_SETTINGS);
  const [strokeLimits, setStrokeLimits] = useState<StrokeMsLimits>(DEFAULT_STROKE_MS_LIMITS);
  const [isLoading, setIsLoading] = useState(true);
  const [settingsLoaded, setSettingsLoaded] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const settingsRef = useRef(settings);
  const saveTimerRef = useRef<number | null>(null);
  const settingsLoadedRef = useRef(false);
  const userEditedRef = useRef(false);
  const persistGenerationRef = useRef(0);

  settingsRef.current = settings;

  const actuatorKindForDevice = useCallback(
    (deviceId: string): AutomaticRunningKind => {
      const registration = registrations.find((row) => row.deviceId === deviceId);
      return automaticRunningKindForActuator(registration?.actuatorKind ?? null);
    },
    [registrations],
  );

  const rememberRunningForDevice = useCallback(
    (deviceId: string | null) => {
      if (!deviceId) {
        return;
      }

      const kind = actuatorKindForDevice(deviceId);
      const running =
        kind === 'motor'
          ? settingsRef.current.motorAutomatic.running
          : settingsRef.current.automatic.running;
      writeDeviceAutomaticRunningLocal(selectedSubRef.current, deviceId, kind, running);
    },
    [actuatorKindForDevice],
  );

  useEffect(() => {
    settingsLoadedRef.current = settingsLoaded;
  }, [settingsLoaded]);

  const persistSettings = useCallback(
    async (deviceId: string, nextSettings: PairingSettings, generation: number) => {
      if (!domTarget) {
        return nextSettings;
      }

      const savedSettings = await savePairingSettings(selectedSub, deviceId, nextSettings);
      if (generation !== persistGenerationRef.current) {
        return savedSettings;
      }

      return savedSettings;
    },
    [domTarget, selectedSub],
  );

  const flushPendingSaveForDevice = useCallback(
    (deviceId: string | null) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }

      if (
        !deviceId ||
        !domTarget ||
        !settingsLoadedRef.current ||
        !userEditedRef.current
      ) {
        return;
      }

      const generation = persistGenerationRef.current;
      const snapshot = settingsRef.current;
      void persistSettings(deviceId, snapshot, generation).catch(() => {
        // Keep local state; the next change or dialog save can retry.
      });
    },
    [domTarget, persistSettings],
  );

  const queuePersist = useCallback(
    (nextSettings: PairingSettings) => {
      if (!settingsLoadedRef.current || !userEditedRef.current) {
        return;
      }

      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }

      const generation = persistGenerationRef.current;

      const deviceId = persistDeviceIdRef.current;
      if (!deviceId) {
        return;
      }

      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void persistSettings(deviceId, nextSettings, generation).catch(() => {
          // Keep local state; the next change or dialog save can retry.
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [persistSettings],
  );

  useEffect(() => {
    return () => {
      flushPendingSaveForDevice(persistDeviceIdRef.current);
    };
  }, [flushPendingSaveForDevice]);

  useEffect(() => {
    if (!domTarget) {
      persistGenerationRef.current += 1;
      userEditedRef.current = false;
      persistDeviceIdRef.current = null;
      setSettings(DEFAULT_PAIRING_SETTINGS);
      setSettingsLoaded(false);
      setIsLoading(false);
      return;
    }

    if (devicesLoading) {
      return;
    }

    if (!selectedDeviceId) {
      persistGenerationRef.current += 1;
      userEditedRef.current = false;
      persistDeviceIdRef.current = null;
      setSettingsLoaded(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;
    const deviceIdForLoad = selectedDeviceId;
    const previousDeviceId = persistDeviceIdRef.current;

    if (previousDeviceId && previousDeviceId !== deviceIdForLoad) {
      rememberRunningForDevice(previousDeviceId);
      cacheDeviceSettings(selectedSub, previousDeviceId, settingsRef.current);
    }

    flushPendingSaveForDevice(previousDeviceId);
    persistGenerationRef.current += 1;
    userEditedRef.current = false;
    persistDeviceIdRef.current = deviceIdForLoad;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setIsLoading(true);
    setSettingsLoaded(false);

    const kindForLoad = actuatorKindForDevice(deviceIdForLoad);
    const restoredRunning = readDeviceAutomaticRunningLocal(
      selectedSub,
      deviceIdForLoad,
      kindForLoad,
    );

    Promise.all([fetchPairingSettings(selectedSub, deviceIdForLoad), fetchStrokeLimits()])
      .then(([loadedSettings, loadedStrokeLimits]) => {
        if (!cancelled) {
          setStrokeLimits(loadedStrokeLimits);
          const manualStroke = normalizeStrokeMsPair(
            loadedSettings.manual.minimumStrokeMs,
            loadedSettings.manual.maximumStrokeMs,
            loadedStrokeLimits,
          );
          const automaticStroke = normalizeStrokeMsPair(
            loadedSettings.automatic.minimumStrokeMs,
            loadedSettings.automatic.maximumStrokeMs,
            loadedStrokeLimits,
          );
          setSettings({
            ...loadedSettings,
            manual: {
              ...loadedSettings.manual,
              ...manualStroke,
            },
            automatic: normalizeAutomaticControlState({
              ...loadedSettings.automatic,
              ...automaticStroke,
              running: kindForLoad === 'relay' ? restoredRunning : false,
            }),
            motorAutomatic: normalizeMotorAutomaticControlState({
              ...loadedSettings.motorAutomatic,
              running: kindForLoad === 'motor' ? restoredRunning : false,
            }),
          });
          setSettingsLoaded(true);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettings(DEFAULT_PAIRING_SETTINGS);
          setSettingsLoaded(false);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setIsLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    actuatorKindForDevice,
    domTarget,
    rememberRunningForDevice,
    selectedSub,
    selectedDeviceId,
    devicesLoading,
    flushPendingSaveForDevice,
  ]);

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    },
    [],
  );

  const applySettings = useCallback(
    (nextSettings: PairingSettings, persistImmediately = false, skipPersist = false) => {
      setSettings(nextSettings);

      if (!domTarget || skipPersist || !settingsLoadedRef.current || !userEditedRef.current) {
        return;
      }

      if (persistImmediately) {
        if (saveTimerRef.current !== null) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }

        const deviceId = persistDeviceIdRef.current;
        if (!deviceId) {
          return;
        }

        const generation = persistGenerationRef.current;
        void persistSettings(deviceId, nextSettings, generation).then((savedSettings) => {
          if (generation === persistGenerationRef.current) {
            setSettings(savedSettings);
          }
        });
        return;
      }

      queuePersist(nextSettings);
    },
    [domTarget, persistSettings, queuePersist],
  );

  const setOptions = useCallback(
    async (nextOptions: AppOptions) => {
      userEditedRef.current = true;
      const nextSettings = {
        ...settingsRef.current,
        appOptions: nextOptions,
      };
      applySettings(nextSettings, true);
    },
    [applySettings],
  );

  const updateManual = useCallback(
    (manual: ManualControlState) => {
      userEditedRef.current = true;
      const normalizedStroke = normalizeStrokeMsPair(
        manual.minimumStrokeMs,
        manual.maximumStrokeMs,
        strokeLimits,
      );
      applySettings({
        ...settingsRef.current,
        manual: {
          ...manual,
          ...normalizedStroke,
        },
      });
    },
    [applySettings, strokeLimits],
  );

  const updateAutomatic = useCallback(
    (automatic: AutomaticControlState) => {
      userEditedRef.current = true;
      const normalizedStroke = normalizeStrokeMsPair(
        automatic.minimumStrokeMs,
        automatic.maximumStrokeMs,
        strokeLimits,
      );
      applySettings({
        ...settingsRef.current,
        automatic: normalizeAutomaticControlState({
          ...automatic,
          ...normalizedStroke,
        }),
      });
    },
    [applySettings, strokeLimits],
  );

  const setDeviceAutomaticRunning = useCallback(
    (deviceId: string, kind: AutomaticRunningKind, running: boolean) => {
      if (!deviceId) {
        return;
      }

      if (!running) {
        clearAutomaticDeviceRunningHint(selectedSubRef.current, deviceId);
      }

      writeDeviceAutomaticRunningLocal(selectedSubRef.current, deviceId, kind, running);

      if (shouldBroadcastLocalChange()) {
        postTabSync({
          type: 'running',
          tabId: getTabId(),
          subTarget: selectedSubRef.current,
          deviceId,
          kind,
          running,
        });
      }

      if (persistDeviceIdRef.current !== deviceId) {
        return;
      }

      const selectedKind = automaticRunningKindForActuator(selectedActuatorKind);
      if (selectedKind !== kind) {
        return;
      }

      if (kind === 'motor') {
        if (settingsRef.current.motorAutomatic.running === running) {
          return;
        }

        applySettings(
          {
            ...settingsRef.current,
            motorAutomatic: {
              ...settingsRef.current.motorAutomatic,
              running,
            },
          },
          false,
          true,
        );
        return;
      }

      if (settingsRef.current.automatic.running === running) {
        return;
      }

      applySettings(
        {
          ...settingsRef.current,
          automatic: {
            ...settingsRef.current.automatic,
            running,
          },
        },
        false,
        true,
      );
    },
    [applySettings, selectedActuatorKind],
  );

  const setAutomaticRunningLocal = useCallback(
    (running: boolean) => {
      const deviceId = persistDeviceIdRef.current;
      if (!deviceId) {
        return;
      }

      setDeviceAutomaticRunning(deviceId, 'relay', running);
    },
    [setDeviceAutomaticRunning],
  );

  const updateMotorAutomatic = useCallback(
    (motorAutomatic: MotorAutomaticControlState) => {
      userEditedRef.current = true;
      applySettings({
        ...settingsRef.current,
        motorAutomatic: normalizeMotorAutomaticControlState(motorAutomatic),
      });
    },
    [applySettings],
  );

  const setMotorAutomaticRunningLocal = useCallback(
    (running: boolean) => {
      const deviceId = persistDeviceIdRef.current;
      if (!deviceId) {
        return;
      }

      setDeviceAutomaticRunning(deviceId, 'motor', running);
    },
    [setDeviceAutomaticRunning],
  );

  const openDialog = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      settings,
      options: settings.appOptions,
      strokeLimits,
      isLoading,
      settingsLoaded,
      setOptions,
      updateManual,
      updateAutomatic,
      updateMotorAutomatic,
      setAutomaticRunningLocal,
      setMotorAutomaticRunningLocal,
      setDeviceAutomaticRunning,
      isDialogOpen,
      openDialog,
      closeDialog,
    }),
    [
      settings,
      strokeLimits,
      isLoading,
      settingsLoaded,
      setOptions,
      updateManual,
      updateAutomatic,
      updateMotorAutomatic,
      setAutomaticRunningLocal,
      setMotorAutomaticRunningLocal,
      setDeviceAutomaticRunning,
      isDialogOpen,
      openDialog,
      closeDialog,
    ],
  );

  return <OptionsContext.Provider value={value}>{children}</OptionsContext.Provider>;
}

export function useOptions(): OptionsContextValue {
  const context = useContext(OptionsContext);
  if (!context) {
    throw new Error('useOptions must be used within an OptionsProvider');
  }
  return context;
}
