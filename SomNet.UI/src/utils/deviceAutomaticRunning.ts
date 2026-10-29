import type { ActuatorKind } from '@/types/device';
import type { PairingSettings } from '@/types/pairingSettings';

/** True when the paired device for this Sub is running an automatic session (not the other Sub's flags). */
export function deviceAutomaticRunningForActuator(
  settings: PairingSettings,
  actuatorKind: ActuatorKind | null,
  settingsLoaded: boolean,
  settingsLoading: boolean,
): boolean {
  if (!settingsLoaded || settingsLoading) {
    return false;
  }

  if (actuatorKind === 'hbridge') {
    return settings.motorAutomatic.running;
  }

  return settings.automatic.running;
}
