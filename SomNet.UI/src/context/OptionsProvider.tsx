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
import { fetchPairingSettings, savePairingSettings } from '@/api/settings';
import { useAuth } from '@/context/AuthProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import type { AppOptions } from '@/types/options';
import type { AutomaticControlState, ManualControlState } from '@/types/modes';
import { DEFAULT_PAIRING_SETTINGS, type PairingSettings } from '@/types/pairingSettings';

interface OptionsContextValue {
  settings: PairingSettings;
  options: AppOptions;
  isLoading: boolean;
  setOptions: (options: AppOptions) => Promise<void>;
  updateManual: (manual: ManualControlState) => void;
  updateAutomatic: (automatic: AutomaticControlState) => void;
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
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const settingsRef = useRef(settings);
  const saveTimerRef = useRef<number | null>(null);

  settingsRef.current = settings;

  const persistSettings = useCallback(
    async (nextSettings: PairingSettings) => {
      if (!domTarget) {
        return nextSettings;
      }

      return savePairingSettings(selectedSub, nextSettings);
    },
    [domTarget, selectedSub],
  );

  const queuePersist = useCallback(
    (nextSettings: PairingSettings) => {
      if (saveTimerRef.current !== null) {
        window.clearTimeout(saveTimerRef.current);
      }

      saveTimerRef.current = window.setTimeout(() => {
        saveTimerRef.current = null;
        void persistSettings(nextSettings).catch(() => {
          // Keep local state; the next change or dialog save can retry.
        });
      }, SAVE_DEBOUNCE_MS);
    },
    [persistSettings],
  );

  useEffect(() => {
    if (!domTarget) {
      setSettings(DEFAULT_PAIRING_SETTINGS);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetchPairingSettings(selectedSub)
      .then((loadedSettings) => {
        if (!cancelled) {
          setSettings(loadedSettings);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setSettings(DEFAULT_PAIRING_SETTINGS);
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

  const applySettings = useCallback(
    (nextSettings: PairingSettings, persistImmediately = false) => {
      setSettings(nextSettings);

      if (!domTarget) {
        return;
      }

      if (persistImmediately) {
        if (saveTimerRef.current !== null) {
          window.clearTimeout(saveTimerRef.current);
          saveTimerRef.current = null;
        }

        void persistSettings(nextSettings).then((savedSettings) => {
          setSettings(savedSettings);
        });
        return;
      }

      queuePersist(nextSettings);
    },
    [domTarget, persistSettings, queuePersist],
  );

  const setOptions = useCallback(
    async (nextOptions: AppOptions) => {
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
      applySettings({
        ...settingsRef.current,
        manual,
      });
    },
    [applySettings],
  );

  const updateAutomatic = useCallback(
    (automatic: AutomaticControlState) => {
      applySettings({
        ...settingsRef.current,
        automatic,
      });
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
      isLoading,
      setOptions,
      updateManual,
      updateAutomatic,
      isDialogOpen,
      openDialog,
      closeDialog,
    }),
    [
      settings,
      isLoading,
      setOptions,
      updateManual,
      updateAutomatic,
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
