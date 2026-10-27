import type { ActuatorKind } from '@/types/device';
import type { PairingSettings } from '@/types/pairingSettings';
import type { SubTargetName } from '@/config/sessionUsers';
import type { AutomaticRunningKind } from '@/utils/tabSync';
import { automaticRunningKindForActuator } from '@/utils/tabSync';
import { readDeviceAutomaticRunningLocal } from '@/utils/deviceAutomaticRunningLocal';
/** Running flag for one device — map is authoritative across device switches. */
export function deviceAutomaticRunningForDevice(
  subTarget: SubTargetName,
  deviceId: string | null | undefined,
  kind: AutomaticRunningKind,
  settings: PairingSettings,
): boolean {
  if (deviceId && readDeviceAutomaticRunningLocal(subTarget, deviceId, kind)) {
    return true;
  }

  if (kind === 'motor') {
    return settings.motorAutomatic.running;
  }

  return settings.automatic.running;
}

export function selectedDeviceAutomaticRunning(
  subTarget: SubTargetName,
  deviceId: string | null | undefined,
  actuatorKind: ActuatorKind | null,
  settings: PairingSettings,
  settingsLoaded: boolean,
  settingsLoading: boolean,
): boolean {
  if (!deviceId || !settingsLoaded || settingsLoading) {
    return false;
  }

  const kind = automaticRunningKindForActuator(actuatorKind);
  return deviceAutomaticRunningForDevice(subTarget, deviceId, kind, settings);
}

export function automaticControlStateForActuator(
  settings: PairingSettings,
  actuatorKind: ActuatorKind | null,
) {
  if (actuatorKind === 'hbridge') {
    return settings.motorAutomatic;
  }

  return settings.automatic;
}
