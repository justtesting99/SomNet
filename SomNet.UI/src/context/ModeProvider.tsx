import {
  createContext,
  useContext,
  type ReactNode,
  useState,
  useCallback,
  useEffect,
} from 'react';
import type { OperationMode } from '@/types/modes';
import {
  readLastOperationMode,
  writeLastOperationMode,
  OPERATION_MODE_STORAGE_KEY,
  isValidOperationMode,
} from '@/config/operationMode';
import { withRemoteSyncApply } from '@/utils/tabSync';

interface ModeContextValue {
  mode: OperationMode | null;
  setMode: (mode: OperationMode | null) => void;
}

const ModeContext = createContext<ModeContextValue | null>(null);

export function ModeProvider({ children }: { children: ReactNode }) {
  const [mode, setModeState] = useState<OperationMode | null>(() => readLastOperationMode());

  const setMode = useCallback((nextMode: OperationMode | null) => {
    setModeState(nextMode);
    writeLastOperationMode(nextMode);
  }, []);

  useEffect(() => {
    function handleStorage(event: StorageEvent) {
      if (event.key !== OPERATION_MODE_STORAGE_KEY) {
        return;
      }

      withRemoteSyncApply(() => {
        if (event.newValue && isValidOperationMode(event.newValue)) {
          setModeState(event.newValue);
          return;
        }

        if (event.newValue === null) {
          setModeState(null);
        }
      });
    }

    window.addEventListener('storage', handleStorage);
    return () => window.removeEventListener('storage', handleStorage);
  }, []);

  return (
    <ModeContext.Provider value={{ mode, setMode }}>
      {children}
    </ModeContext.Provider>
  );
}

export function useMode(): ModeContextValue {
  const context = useContext(ModeContext);
  if (!context) {
    throw new Error('useMode must be used within a ModeProvider');
  }
  return context;
}
