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
import { DEFAULT_STROKE_MS_LIMITS } from '@/config/strokeLimits';
import type { AppOptions } from '@/types/options';
import type { AutomaticControlState, ManualControlState } from '@/types/modes';
import { DEFAULT_PAIRING_SETTINGS, type PairingSettings } from '@/types/pairingSettings';
import type { StrokeMsLimits } from '@/utils/strokeMsLimits';
import { normalizeStrokeMsPair } from '@/utils/strokeMsLimits';
import { normalizeAutomaticControlState } from '@/utils/automaticFieldRules';
import { getTabId, postTabSync, shouldBroadcastLocalChange } from '@/utils/tabSync';

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
  /** Set running flag locally without persisting (session rehydration). */
  setAutomaticRunningLocal: (running: boolean) => void;
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const OptionsContext = createContext<OptionsContextValue | null>(null);

const SAVE_DEBOUNCE_MS = 400;

export function OptionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
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

  useEffect(() => {
    settingsLoadedRef.current = settingsLoaded;
  }, [settingsLoaded]);

  const persistSettings = useCallback(
    async (nextSettings: PairingSettings, generation: number) => {
      if (!domTarget) {
        return nextSettings;
      }

      const savedSettings = await savePairingSettings(selectedSub, nextSettings);
      if (generation !== persistGenerationRef.current) {
        return savedSettings;
      }

      return savedSettings;
    },
    [domTarget, selectedSub],
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

      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void persistSettings(nextSettings, generation).catch(() => {
          // Keep local state; the next change or dialog save can retry.
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [persistSettings],
  );

  useEffect(() => {
    if (!domTarget) {
      persistGenerationRef.current += 1;
      userEditedRef.current = false;
      setSettings(DEFAULT_PAIRING_SETTINGS);
      setSettingsLoaded(false);
      setIsLoading(false);
      return;
    }

    let cancelled = false;

    persistGenerationRef.current += 1;
    userEditedRef.current = false;

    if (saveTimerRef.current !== null) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }

    setIsLoading(true);
    setSettingsLoaded(false);

    Promise.all([fetchPairingSettings(selectedSub), fetchStrokeLimits()])
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
  }, [domTarget, selectedSub]);

  useEffect(
    () => () => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (!shouldBroadcastLocalChange()) {
      return;
    }

    postTabSync({
      type: 'running',
      tabId: getTabId(),
      running: settings.automatic.running,
    });
  }, [settings.automatic.running]);

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

        const generation = persistGenerationRef.current;
        void persistSettings(nextSettings, generation).then((savedSettings) => {
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

  const setAutomaticRunningLocal = useCallback(
    (running: boolean) => {
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
    [applySettings],
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
      setAutomaticRunningLocal,
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
      setAutomaticRunningLocal,
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
