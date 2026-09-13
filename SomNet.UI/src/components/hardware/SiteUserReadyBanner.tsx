import { Button } from '@/components/ui/Button';
import { useSiteUserReady } from '@/context/SiteUserReadyProvider';
import { useSubTarget } from '@/context/SubTargetProvider';

export function SiteUserReadyBanner() {
  const { notification, clearNotification } = useSiteUserReady();
  const { selectedSub } = useSubTarget();

  if (!notification || notification.subTarget !== selectedSub) {
    return null;
  }

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100"
      role="status"
    >
      <span>{notification.message}</span>
      <Button variant="secondary" size="sm" onClick={clearNotification}>
        Dismiss
      </Button>
    </div>
  );
}
