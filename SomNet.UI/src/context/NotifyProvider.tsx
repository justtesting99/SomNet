import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface NotifyContextValue {
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const NotifyContext = createContext<NotifyContextValue | null>(null);

export function NotifyProvider({ children }: { children: ReactNode }) {
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

  return <NotifyContext.Provider value={value}>{children}</NotifyContext.Provider>;
}

export function useNotify(): NotifyContextValue {
  const context = useContext(NotifyContext);
  if (!context) {
    throw new Error('useNotify must be used within a NotifyProvider');
  }
  return context;
}
