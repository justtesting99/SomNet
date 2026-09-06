import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { HardwareCommandKey, HardwareCommandStatus } from '@/types/hardwareCommand';

interface HardwareCommandContextValue {
  getCommandStatus: (commandKey: HardwareCommandKey) => HardwareCommandStatus;
  isCommandPending: (commandKey: HardwareCommandKey) => boolean;
  executeCommand: (
    commandKey: HardwareCommandKey,
    action: () => void | Promise<void>,
  ) => Promise<void>;
}

const HardwareCommandContext = createContext<HardwareCommandContextValue | null>(null);

export function HardwareCommandProvider({ children }: { children: ReactNode }) {
  const pendingRef = useRef(new Set<HardwareCommandKey>());
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<HardwareCommandKey>>(
    () => new Set(),
  );

  const syncPendingState = useCallback(() => {
    setPendingKeys(new Set(pendingRef.current));
  }, []);

  const executeCommand = useCallback(
    async (commandKey: HardwareCommandKey, action: () => void | Promise<void>) => {
      if (pendingRef.current.has(commandKey)) {
        return;
      }

      pendingRef.current.add(commandKey);
      syncPendingState();

      try {
        await action();
      } finally {
        pendingRef.current.delete(commandKey);
        syncPendingState();
      }
    },
    [syncPendingState],
  );

  const getCommandStatus = useCallback(
    (commandKey: HardwareCommandKey): HardwareCommandStatus =>
      pendingKeys.has(commandKey) ? 'pending' : 'idle',
    [pendingKeys],
  );

  const isCommandPending = useCallback(
    (commandKey: HardwareCommandKey) => pendingKeys.has(commandKey),
    [pendingKeys],
  );

  const value = useMemo(
    () => ({
      getCommandStatus,
      isCommandPending,
      executeCommand,
    }),
    [getCommandStatus, isCommandPending, executeCommand],
  );

  return (
    <HardwareCommandContext.Provider value={value}>{children}</HardwareCommandContext.Provider>
  );
}

export function useHardwareCommand(): HardwareCommandContextValue {
  const context = useContext(HardwareCommandContext);
  if (!context) {
    throw new Error('useHardwareCommand must be used within a HardwareCommandProvider');
  }
  return context;
}
