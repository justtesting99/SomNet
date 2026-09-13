import { useEffect, useRef } from 'react';
import { useSiteUserReady } from '@/context/SiteUserReadyProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import type { VideoPreviewControls } from '@/hooks/useSessionVideoSources';

/** When the site user double-clicks the device button, auto-run Start feed when allowed. */
export function useSiteUserReadyStartFeed(videoPreview: VideoPreviewControls | undefined) {
  const { notification } = useSiteUserReady();
  const { selectedSub } = useSubTarget();
  const previewRef = useRef(videoPreview);

  previewRef.current = videoPreview;

  useEffect(() => {
    if (!notification?.requestStartFeed || notification.subTarget !== selectedSub) {
      return;
    }

    const preview = previewRef.current;
    if (!preview?.available || preview.feedsActive) {
      return;
    }

    if (!preview.canStart) {
      return;
    }

    void preview.start();
  }, [
    notification,
    selectedSub,
    videoPreview?.available,
    videoPreview?.canStart,
    videoPreview?.feedsActive,
    videoPreview?.start,
  ]);
}
