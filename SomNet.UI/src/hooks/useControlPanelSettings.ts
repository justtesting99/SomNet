import { useDeviceOperationScope, useOperationActuatorKind, useOperationDeviceId } from '@/context/DeviceOperationScope';
import { useDevicePairingSettings } from '@/context/DevicePairingSettingsProvider';
import { useOptions } from '@/context/OptionsProvider';
import type { ActuatorKind } from '@/types/device';

/**
 * Settings for the control panel — per-device slice when inside DeviceOperationScope,
 * otherwise OptionsProvider (single-device / legacy).
 */
export function useControlPanelSettings() {
  const scope = useDeviceOperationScope();
  const deviceId = useOperationDeviceId();
  const actuatorKind = (useOperationActuatorKind() ?? 'relay') as ActuatorKind;
  const panel = useDevicePairingSettings(deviceId, scope?.actuatorKind ?? actuatorKind);
  const options = useOptions();

  if (scope) {
    return {
      settings: panel.settings,
      isLoading: panel.isLoading,
      settingsLoaded: panel.settingsLoaded,
      strokeLimits: options.strokeLimits,
      updateManual: panel.updateManual,
      updateAutomatic: panel.updateAutomatic,
      updateMotorAutomatic: panel.updateMotorAutomatic,
      setAutomaticRunningLocal: panel.setAutomaticRunningLocal,
      setMotorAutomaticRunningLocal: panel.setMotorAutomaticRunningLocal,
    };
  }

  return {
    settings: options.settings,
    isLoading: options.isLoading,
    settingsLoaded: options.settingsLoaded,
    strokeLimits: options.strokeLimits,
    updateManual: options.updateManual,
    updateAutomatic: options.updateAutomatic,
    updateMotorAutomatic: options.updateMotorAutomatic,
    setAutomaticRunningLocal: options.setAutomaticRunningLocal,
    setMotorAutomaticRunningLocal: options.setMotorAutomaticRunningLocal,
  };
}
