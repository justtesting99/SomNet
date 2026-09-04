import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { fetchOptions, saveOptions as saveOptionsApi } from '@/api/options';
import { useAuth } from '@/context/AuthProvider';
import { DEFAULT_APP_OPTIONS, type AppOptions } from '@/types/options';

interface OptionsContextValue {
  options: AppOptions;
  setOptions: (options: AppOptions) => Promise<void>;
  isLoading: boolean;
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const OptionsContext = createContext<OptionsContextValue | null>(null);

export function OptionsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const username = user?.username ?? '';
  const [options, setOptionsState] = useState<AppOptions>(DEFAULT_APP_OPTIONS);
  const [isLoading, setIsLoading] = useState(false);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  useEffect(() => {
    if (!username) {
      setOptionsState(DEFAULT_APP_OPTIONS);
      return;
    }

    let cancelled = false;
    setIsLoading(true);

    fetchOptions(username)
      .then((loadedOptions) => {
        if (!cancelled) {
          setOptionsState(loadedOptions);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setOptionsState(DEFAULT_APP_OPTIONS);
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
  }, [username]);

  const setOptions = useCallback(
    async (nextOptions: AppOptions) => {
      if (!username) {
        setOptionsState(nextOptions);
        return;
      }

      const savedOptions = await saveOptionsApi(username, nextOptions);
      setOptionsState(savedOptions);
    },
    [username],
  );

  const openDialog = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      options,
      setOptions,
      isLoading,
      isDialogOpen,
      openDialog,
      closeDialog,
    }),
    [options, setOptions, isLoading, isDialogOpen, openDialog, closeDialog],
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
