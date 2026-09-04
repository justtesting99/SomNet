import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_APP_OPTIONS, type AppOptions } from '@/types/options';

interface OptionsContextValue {
  options: AppOptions;
  setOptions: (options: AppOptions) => void;
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const OptionsContext = createContext<OptionsContextValue | null>(null);

export function OptionsProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<AppOptions>(DEFAULT_APP_OPTIONS);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

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
      isDialogOpen,
      openDialog,
      closeDialog,
    }),
    [options, isDialogOpen, openDialog, closeDialog],
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
