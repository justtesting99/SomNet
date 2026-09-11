import { useTabSync } from '@/context/TabSyncProvider';

export function TabSyncBanner() {
  const { hasRemoteCommandLock } = useTabSync();

  if (!hasRemoteCommandLock) {
    return null;
  }

  return (
    <div
      className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-2 text-sm text-amber-100"
      role="status"
    >
      Another browser tab is sending a hardware command. Start, stroke, and burst controls are
      temporarily disabled here.
    </div>
  );
}
