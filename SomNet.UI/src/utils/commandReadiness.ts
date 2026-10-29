import type { DeviceRegistration } from '@/types/device';
import type { ConnectionState, SystemStatusSnapshot } from '@/types/systemStatus';

export function isHubLinkReady(status: SystemStatusSnapshot): boolean {
  return status.api === 'online' && status.signalR === 'online';
}

export function isDeviceConnectionOnline(status: SystemStatusSnapshot): boolean {
  return status.device === 'online';
}

/** API + SignalR + selected device connection (from status poll). */
export function isHardwareCommandReady(status: SystemStatusSnapshot): boolean {
  return isHubLinkReady(status) && isDeviceConnectionOnline(status);
}

/** Prefer polled hub status; fall back to registration snapshot before first poll. */
export function resolveDeviceConnectionOnline(
  registration: DeviceRegistration | null | undefined,
  status: SystemStatusSnapshot,
): boolean {
  if (status.lastChecked) {
    return isDeviceConnectionOnline(status);
  }

  return registration?.isConnected ?? false;
}

export function resolveDeviceConnectionLabel(
  registration: DeviceRegistration | null | undefined,
  status: SystemStatusSnapshot,
): ConnectionState {
  if (status.lastChecked) {
    return status.device;
  }

  return registration?.isConnected ? 'online' : 'offline';
}
