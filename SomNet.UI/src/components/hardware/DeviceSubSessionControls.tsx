import type { ActuatorKind } from '@/types/device';
import { HeaderToggle } from '@/components/hardware/HeaderToggle';
import { useDeviceSceneSessionControls } from '@/hooks/useDeviceSceneSessionControls';

interface DeviceSubSessionControlsProps {
  deviceId: string;
  actuatorKind: ActuatorKind;
}

export function DeviceSubSessionControls({
  deviceId,
  actuatorKind,
}: DeviceSubSessionControlsProps) {
  const {
    sceneSessionActive,
    accessoryEngaged,
    sceneTogglePending,
    accessoryTogglePending,
    sceneSwitchDisabled,
    accessorySwitchDisabled,
    sceneSwitchDisabledReason,
    accessorySwitchDisabledReason,
    setSceneSessionActive,
    setAccessoryEngaged,
  } = useDeviceSceneSessionControls(deviceId, actuatorKind);

  return (
    <div className="flex min-w-0 flex-col gap-2 lg:flex-row lg:items-start">
      <HeaderToggle
        label="Scene"
        shortLabel="Scene"
        active={sceneSessionActive}
        disabled={sceneSwitchDisabled}
        pending={sceneTogglePending}
        disabledReason={sceneSwitchDisabledReason}
        ariaLabel={`Scene session for ${deviceId}`}
        dataUi={`scene-session-${deviceId}`}
        toneActive="indigo"
        onToggle={() => void setSceneSessionActive(!sceneSessionActive)}
      />
      <HeaderToggle
        label="Accessory"
        shortLabel="Accessory"
        active={accessoryEngaged}
        disabled={accessorySwitchDisabled}
        pending={accessoryTogglePending}
        disabledReason={accessorySwitchDisabledReason}
        ariaLabel={`Accessory for ${deviceId}`}
        dataUi={`device-accessory-${deviceId}`}
        toneActive="amber"
        onToggle={() => void setAccessoryEngaged(!accessoryEngaged)}
      />
    </div>
  );
}
