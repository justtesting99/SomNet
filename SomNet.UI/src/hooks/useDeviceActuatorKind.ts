import type { ActuatorKind } from '@/types/device';
import { useSubDevice } from '@/context/SubDeviceProvider';

export function useDeviceActuatorKind(): {
  actuatorKind: ActuatorKind | null;
  isLoading: boolean;
  hasDevice: boolean;
} {
  const { selectedActuatorKind, isLoading, selectedDeviceId } = useSubDevice();
  return {
    actuatorKind: selectedActuatorKind,
    isLoading,
    hasDevice: Boolean(selectedDeviceId),
  };
}
