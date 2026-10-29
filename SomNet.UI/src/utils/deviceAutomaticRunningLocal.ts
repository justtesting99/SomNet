import type { SubTargetName } from '@/config/sessionUsers';
import type { AutomaticRunningKind } from '@/utils/tabSync';

function runningKey(subTarget: SubTargetName, deviceId: string, kind: AutomaticRunningKind): string {
  return `${subTarget}::${deviceId}::${kind}`;
}

const runningByDevice = new Map<string, boolean>();

export function writeDeviceAutomaticRunningLocal(
  subTarget: SubTargetName,
  deviceId: string,
  kind: AutomaticRunningKind,
  running: boolean,
): void {
  if (!deviceId) {
    return;
  }

  const key = runningKey(subTarget, deviceId, kind);
  if (running) {
    runningByDevice.set(key, true);
  } else {
    runningByDevice.delete(key);
  }
}

export function readDeviceAutomaticRunningLocal(
  subTarget: SubTargetName,
  deviceId: string,
  kind: AutomaticRunningKind,
): boolean {
  if (!deviceId) {
    return false;
  }

  return runningByDevice.get(runningKey(subTarget, deviceId, kind)) === true;
}

/** Test helper */
export function clearDeviceAutomaticRunningLocalStore(): void {
  runningByDevice.clear();
}
