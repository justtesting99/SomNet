import { createContext, useContext, type ReactNode, useState, useCallback } from 'react';
import type { OperationMode } from '@/types/modes';
import { readLastOperationMode, writeLastOperationMode } from '@/config/operationMode';

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
