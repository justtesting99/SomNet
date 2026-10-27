import { createContext, useContext, type ReactNode } from 'react';
import { useSubDevice } from '@/context/SubDeviceProvider';
import type { ActuatorKind } from '@/types/device';

export interface DeviceOperationScopeValue {
  deviceId: string;
  actuatorKind: ActuatorKind;
}

const DeviceOperationScopeContext = createContext<DeviceOperationScopeValue | null>(null);

export function DeviceOperationScope({
  deviceId,
  actuatorKind,
  children,
}: DeviceOperationScopeValue & { children: ReactNode }) {
  return (
    <DeviceOperationScopeContext.Provider value={{ deviceId, actuatorKind }}>
      {children}
    </DeviceOperationScopeContext.Provider>
  );
}

export function useDeviceOperationScope(): DeviceOperationScopeValue | null {
  return useContext(DeviceOperationScopeContext);
}

/** Device for commands in this subtree — falls back to header-selected device. */
export function useOperationDeviceId(): string {
  const scope = useDeviceOperationScope();
  const { selectedDeviceId, registrations } = useSubDevice();

  const deviceId = scope?.deviceId ?? selectedDeviceId;
  if (!deviceId) {
    throw new Error(
      registrations.length === 0
        ? 'No device paired for this Sub. Pair hardware in Options.'
        : 'Select a device for this Sub.',
    );
  }

  return deviceId;
}

export function useOperationActuatorKind(): ActuatorKind | null {
  const scope = useDeviceOperationScope();
  if (scope) {
    return scope.actuatorKind;
  }

  return useSubDevice().selectedActuatorKind;
}
