import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import type { ActuatorKind } from '@/types/device';
import type { OperationMode } from '@/types/modes';
import {
  readDeviceOperationMode,
  writeDeviceOperationMode,
} from '@/utils/deviceOperationModeStorage';
import { getTabId, postTabSync, subscribeTabSync, withRemoteSyncApply } from '@/utils/tabSync';

interface DeviceOperationModeContextValue {
  /** Effective mode for UI on this device (motor defaults to automatic). */
  getDeviceOperationMode: (deviceId: string, actuatorKind: ActuatorKind) => OperationMode;
  /** Stored mode, or null if relay operator has not chosen yet. */
  getStoredDeviceOperationMode: (deviceId: string) => OperationMode | null;
  setDeviceOperationMode: (deviceId: string, mode: OperationMode) => void;
}

const DeviceOperationModeContext = createContext<DeviceOperationModeContextValue | null>(null);

function defaultModeForActuator(_actuatorKind: ActuatorKind): OperationMode {
  return 'manual';
}

export function DeviceOperationModeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const domTarget = user?.displayName ?? user?.username ?? '';
  const [revision, setRevision] = useState(0);

  const bump = useCallback(() => setRevision((n) => n + 1), []);

  useEffect(() => {
    return subscribeTabSync((message) => {
      if (message.type !== 'device-mode') {
        return;
      }

      if (message.subTarget !== selectedSub || !domTarget) {
        return;
      }

      withRemoteSyncApply(() => {
        writeDeviceOperationMode(domTarget, selectedSub, message.deviceId, message.mode);
        bump();
      });
    });
  }, [bump, domTarget, selectedSub]);

  const getStoredDeviceOperationMode = useCallback(
    (deviceId: string): OperationMode | null => {
      if (!domTarget) {
        return null;
      }

      void revision;
      return readDeviceOperationMode(domTarget, selectedSub, deviceId);
    },
    [domTarget, revision, selectedSub],
  );

  const getDeviceOperationMode = useCallback(
    (deviceId: string, actuatorKind: ActuatorKind): OperationMode => {
      const stored = getStoredDeviceOperationMode(deviceId);
      if (stored) {
        return stored;
      }

      return defaultModeForActuator(actuatorKind);
    },
    [getStoredDeviceOperationMode],
  );

  const setDeviceOperationMode = useCallback(
    (deviceId: string, mode: OperationMode) => {
      if (!domTarget) {
        return;
      }

      writeDeviceOperationMode(domTarget, selectedSub, deviceId, mode);
      bump();
      postTabSync({
        type: 'device-mode',
        tabId: getTabId(),
        subTarget: selectedSub,
        deviceId,
        mode,
      });
    },
    [bump, domTarget, selectedSub],
  );

  const value = useMemo(
    () => ({
      getDeviceOperationMode,
      getStoredDeviceOperationMode,
      setDeviceOperationMode,
    }),
    [getDeviceOperationMode, getStoredDeviceOperationMode, setDeviceOperationMode],
  );

  return (
    <DeviceOperationModeContext.Provider value={value}>
      {children}
    </DeviceOperationModeContext.Provider>
  );
}

export function useDeviceOperationModeApi(): DeviceOperationModeContextValue {
  const context = useContext(DeviceOperationModeContext);
  if (!context) {
    throw new Error('useDeviceOperationModeApi must be used within DeviceOperationModeProvider');
  }

  return context;
}

export function useDeviceOperationMode(deviceId: string, actuatorKind: ActuatorKind) {
  const api = useDeviceOperationModeApi();
  const mode = api.getDeviceOperationMode(deviceId, actuatorKind);
  const stored = api.getStoredDeviceOperationMode(deviceId);
  const needsModeChoice = stored === null;

  return {
    mode,
    needsModeChoice,
    setMode: (next: OperationMode) => api.setDeviceOperationMode(deviceId, next),
  };
}
