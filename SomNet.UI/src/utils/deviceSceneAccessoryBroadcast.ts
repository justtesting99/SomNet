import type { SubTargetName } from '@/config/sessionUsers';
import { getTabId, postTabSync, shouldBroadcastLocalChange } from '@/utils/tabSync';
import {
  writeDeviceAccessoryEngaged,
  writeDeviceSceneSessionActive,
} from '@/utils/sessionAccessoryStorage';
import { writeReadyBannerDismissed } from '@/utils/readyBannerStorage';

export function persistDeviceSceneSession(
  domTarget: string,
  subTarget: SubTargetName,
  deviceId: string,
  active: boolean,
  options?: { dismissReadyBanner?: () => void },
): void {
  writeDeviceSceneSessionActive(domTarget, subTarget, deviceId, active);

  if (active) {
    options?.dismissReadyBanner?.();
  } else {
    writeReadyBannerDismissed(subTarget, false);
  }

  if (shouldBroadcastLocalChange()) {
    postTabSync({
      type: 'scene-session',
      tabId: getTabId(),
      active,
      subTarget,
      deviceId,
    });
  }
}

export function persistDeviceAccessoryEngaged(
  domTarget: string,
  subTarget: SubTargetName,
  deviceId: string,
  engaged: boolean,
): void {
  writeDeviceAccessoryEngaged(domTarget, subTarget, deviceId, engaged);

  if (shouldBroadcastLocalChange()) {
    postTabSync({
      type: 'device-accessory',
      tabId: getTabId(),
      engaged,
      subTarget,
      deviceId,
    });
  }
}
