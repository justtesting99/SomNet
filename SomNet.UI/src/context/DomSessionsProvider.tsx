import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface DomSessionsContextValue {
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const DomSessionsContext = createContext<DomSessionsContextValue | null>(null);

export function DomSessionsProvider({ children }: { children: ReactNode }) {
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

  return <DomSessionsContext.Provider value={value}>{children}</DomSessionsContext.Provider>;
}

export function useDomSessions(): DomSessionsContextValue {
  const context = useContext(DomSessionsContext);
  if (!context) {
    throw new Error('useDomSessions must be used within a DomSessionsProvider');
  }
  return context;
}
