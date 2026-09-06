import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface HardwareContextValue {
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const HardwareContext = createContext<HardwareContextValue | null>(null);

export function HardwareProvider({ children }: { children: ReactNode }) {
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const openDialog = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      isDialogOpen,
      openDialog,
      closeDialog,
    }),
    [isDialogOpen, openDialog, closeDialog],
  );

  return <HardwareContext.Provider value={value}>{children}</HardwareContext.Provider>;
}

export function useHardwareDialog(): HardwareContextValue {
  const context = useContext(HardwareContext);
  if (!context) {
    throw new Error('useHardwareDialog must be used within a HardwareProvider');
  }
  return context;
}
