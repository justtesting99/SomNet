import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { type SubTargetName } from '@/config/sessionUsers';
import { readSelectedSub, writeSelectedSub } from '@/config/selectedSub';
import { getTabId, postTabSync, shouldBroadcastLocalChange } from '@/utils/tabSync';

interface SubTargetContextValue {
  selectedSub: SubTargetName;
  setSelectedSub: (sub: SubTargetName) => void;
  applySubFromSync: (sub: SubTargetName) => void;
  isDialogOpen: boolean;
  openDialog: () => void;
  closeDialog: () => void;
}

const SubTargetContext = createContext<SubTargetContextValue | null>(null);

export function SubTargetProvider({ children }: { children: ReactNode }) {
  const [selectedSub, setSelectedSubState] = useState<SubTargetName>(() => readSelectedSub());
  const [isDialogOpen, setIsDialogOpen] = useState(false);

  const applySubFromSync = useCallback((sub: SubTargetName) => {
    setSelectedSubState(sub);
    writeSelectedSub(sub);
  }, []);

  const setSelectedSub = useCallback((sub: SubTargetName) => {
    setSelectedSubState(sub);
    writeSelectedSub(sub);

    if (shouldBroadcastLocalChange()) {
      postTabSync({ type: 'sub', tabId: getTabId(), subTarget: sub });
    }
  }, []);

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
      applySubFromSync,
      isDialogOpen,
      openDialog,
      closeDialog,
    }),
    [selectedSub, setSelectedSub, applySubFromSync, isDialogOpen, openDialog, closeDialog],
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
