import type { SystemStatusSnapshot } from '@/types/systemStatus';

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
