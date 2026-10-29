import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { HardwareCommandKey, HardwareCommandStatus } from '@/types/hardwareCommand';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { hardwareCommandLockKey } from '@/utils/hardwareCommandLock';
import { getTabId, postTabSync, shouldBroadcastLocalChange } from '@/utils/tabSync';

interface HardwareCommandContextValue {
  getCommandStatus: (commandKey: HardwareCommandKey, deviceId?: string | null) => HardwareCommandStatus;
  isCommandPending: (commandKey: HardwareCommandKey, deviceId?: string | null) => boolean;
  executeCommand: (
    commandKey: HardwareCommandKey,
    action: () => void | Promise<void>,
    deviceId?: string | null,
  ) => Promise<boolean>;
}

const HardwareCommandContext = createContext<HardwareCommandContextValue | null>(null);

export function HardwareCommandProvider({ children }: { children: ReactNode }) {
  const { selectedSub } = useSubTarget();
  const { selectedDeviceId } = useSubDevice();
  const pendingRef = useRef(new Set<string>());
  const [pendingKeys, setPendingKeys] = useState<ReadonlySet<string>>(() => new Set());

  const syncPendingState = useCallback(() => {
    setPendingKeys(new Set(pendingRef.current));
  }, []);

  const resolveDeviceId = useCallback(
    (deviceId?: string | null) => deviceId ?? selectedDeviceId ?? '',
    [selectedDeviceId],
  );

  const executeCommand = useCallback(
    async (
      commandKey: HardwareCommandKey,
      action: () => void | Promise<void>,
      deviceId?: string | null,
    ) => {
      const resolvedDeviceId = resolveDeviceId(deviceId);
      const lockKey = hardwareCommandLockKey(resolvedDeviceId, commandKey);
      if (pendingRef.current.has(lockKey)) {
        return false;
      }

      pendingRef.current.add(lockKey);
      syncPendingState();

      try {
        await action();
        return true;
      } finally {
        pendingRef.current.delete(lockKey);
        syncPendingState();
      }
    },
    [resolveDeviceId, syncPendingState],
  );

  useEffect(() => {
    pendingRef.current.clear();
    syncPendingState();
  }, [selectedSub, syncPendingState]);

  const isCommandPending = useCallback(
    (commandKey: HardwareCommandKey, deviceId?: string | null) => {
      const resolvedDeviceId = resolveDeviceId(deviceId);
      return pendingKeys.has(hardwareCommandLockKey(resolvedDeviceId, commandKey));
    },
    [pendingKeys, resolveDeviceId],
  );

  const getCommandStatus = useCallback(
    (commandKey: HardwareCommandKey, deviceId?: string | null): HardwareCommandStatus =>
      isCommandPending(commandKey, deviceId) ? 'pending' : 'idle',
    [isCommandPending],
  );

  useEffect(() => {
    if (!shouldBroadcastLocalChange()) {
      return;
    }

    postTabSync({
      type: 'command-lock',
      tabId: getTabId(),
      lockKeys: [...pendingKeys],
    });
  }, [pendingKeys]);

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
