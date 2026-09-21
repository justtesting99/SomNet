import { useEffect } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useSessionAccessory } from '@/context/SessionAccessoryProvider';
import { useSiteUserReady } from '@/context/SiteUserReadyProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { subTargetsMatch } from '@/utils/readyBannerStorage';
import { readSessionAccessoryInProgress } from '@/utils/sessionAccessoryStorage';
import { Button } from '@/components/ui/Button';

export function SiteUserReadyBanner() {
  const { user } = useAuth();
  const domTarget = user?.displayName ?? user?.username ?? '';
  const { notification, dismissReadyBannerForSub, isReadyBannerDismissedForSub } =
    useSiteUserReady();
  const { selectedSub } = useSubTarget();
  const { sessionInProgress, togglePending } = useSessionAccessory();

  const accessoryActive =
    sessionInProgress ||
    togglePending ||
    (domTarget ? readSessionAccessoryInProgress(domTarget, selectedSub) : false);

  const bannerDismissed = isReadyBannerDismissedForSub(selectedSub);

  useEffect(() => {
    if (!accessoryActive || !notification) {
      return;
    }

    if (subTargetsMatch(notification.subTarget, selectedSub)) {
      dismissReadyBannerForSub(selectedSub);
    }
  }, [
    accessoryActive,
    dismissReadyBannerForSub,
    notification,
    selectedSub,
  ]);

  if (
    !notification ||
    !subTargetsMatch(notification.subTarget, selectedSub) ||
    accessoryActive ||
    bannerDismissed
  ) {
    return null;
  }

  return (
    <div
      className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-4 py-2 text-sm text-emerald-100"
      role="status"
    >
      <span>{notification.message}</span>
      <Button
        variant="secondary"
        size="sm"
        onClick={() => dismissReadyBannerForSub(selectedSub)}
      >
        Dismiss
      </Button>
    </div>
  );
}
