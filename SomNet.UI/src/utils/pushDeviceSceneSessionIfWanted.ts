import type { SubTargetName } from '@/config/sessionUsers';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { sendHardwareCommand } from '@/services/hardwareCommand';
import { readDeviceSceneSessionActive } from '@/utils/sessionAccessoryStorage';

/** Best-effort: align device scene with UI storage before motion commands. */
export async function pushDeviceSceneSessionIfWanted(
  domTarget: string,
  subTarget: SubTargetName,
  deviceId: string,
): Promise<void> {
  if (!domTarget || !deviceId) {
    return;
  }

  if (!readDeviceSceneSessionActive(domTarget, subTarget, deviceId)) {
    return;
  }

  await sendHardwareCommand(
    subTarget,
    deviceId,
    HARDWARE_COMMAND_KEYS.sceneSession,
    JSON.stringify({ enabled: true }),
  );
}
