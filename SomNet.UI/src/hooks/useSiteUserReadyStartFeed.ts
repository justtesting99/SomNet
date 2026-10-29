import { useEffect, useRef } from 'react';
import { useSiteUserReady } from '@/context/SiteUserReadyProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { subTargetsMatch } from '@/utils/readyBannerStorage';
import type { VideoPreviewControls } from '@/hooks/useSessionVideoSources';

/** When the site user presses the device button (single click), auto-run Start feed when allowed. */
export function useSiteUserReadyStartFeed(videoPreview: VideoPreviewControls | undefined) {
  const { deviceButtonReadySignal } = useSiteUserReady();
  const { selectedSub } = useSubTarget();
  const previewRef = useRef(videoPreview);

  previewRef.current = videoPreview;

  useEffect(() => {
    if (
      !deviceButtonReadySignal?.requestStartFeed ||
      !subTargetsMatch(deviceButtonReadySignal.subTarget, selectedSub)
    ) {
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
    deviceButtonReadySignal,
    selectedSub,
    videoPreview?.available,
    videoPreview?.canStart,
    videoPreview?.feedsActive,
    videoPreview?.start,
  ]);
}
