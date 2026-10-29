import { useTabSync } from '@/context/TabSyncProvider';

export function DeviceTabSyncLockBanner({ deviceId }: { deviceId: string }) {
  const { hasRemoteCommandLock } = useTabSync();

  if (!hasRemoteCommandLock(deviceId)) {
    return null;
  }

  return (
    <div
      className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
      role="status"
    >
      Another browser tab is sending a hardware command for this device. Start, stroke, and burst
      controls are temporarily disabled here.
    </div>
  );
}
