import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { DEFAULT_SUB_TARGET, type SubTargetName } from '@/config/sessionUsers';

interface SubTargetContextValue {
  selectedSub: SubTargetName;
  setSelectedSub: (sub: SubTargetName) => void;
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const SubTargetContext = createContext<SubTargetContextValue | null>(null);

export function SubTargetProvider({ children }: { children: ReactNode }) {
  const [selectedSub, setSelectedSub] = useState<SubTargetName>(DEFAULT_SUB_TARGET);
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const openDialog = useCallback(() => {
    setIsDialogOpen(true);
  }, []);

  const closeDialog = useCallback(() => {
    setIsDialogOpen(false);
  }, []);

  const value = useMemo(
    () => ({
      selectedSub,
      setSelectedSub,
      isDialogOpen,
      openDialog,
      closeDialog,
    }),
    [selectedSub, isDialogOpen, openDialog, closeDialog],
  );

  return <SubTargetContext.Provider value={value}>{children}</SubTargetContext.Provider>;
}

export function useSubTarget(): SubTargetContextValue {
  const context = useContext(SubTargetContext);
  if (!context) {
    throw new Error('useSubTarget must be used within a SubTargetProvider');
  }
  return context;
}
