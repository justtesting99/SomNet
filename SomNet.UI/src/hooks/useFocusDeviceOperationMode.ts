import { useDeviceOperationModeApi } from '@/context/DeviceOperationModeProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';

/** Operation mode for the header Focus device (video / status). */
export function useFocusDeviceOperationMode(): 'manual' | 'automatic' | null {
  const { selectedDeviceId, selectedRegistration } = useSubDevice();
  const { getDeviceOperationMode } = useDeviceOperationModeApi();

  if (!selectedDeviceId || !selectedRegistration) {
    return null;
  }

  return getDeviceOperationMode(selectedDeviceId, selectedRegistration.actuatorKind);
}
