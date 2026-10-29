import type { SubTargetName } from '@/config/sessionUsers';
import type { AutomaticRunningKind } from '@/utils/tabSync';

export const DEVICE_AUTOMATIC_RUNNING_SYNC_EVENT = 'somnet-device-automatic-running-sync';

export interface DeviceAutomaticRunningSyncDetail {
  subTarget: SubTargetName;
  deviceId: string;
  kind: AutomaticRunningKind;
  running: boolean;
}

/** Notify all UI stores (per-device pairing rows + Options) that running changed. */
export function dispatchDeviceAutomaticRunningSync(detail: DeviceAutomaticRunningSyncDetail): void {
  window.dispatchEvent(
    new CustomEvent<DeviceAutomaticRunningSyncDetail>(DEVICE_AUTOMATIC_RUNNING_SYNC_EVENT, {
      detail,
    }),
  );
}
