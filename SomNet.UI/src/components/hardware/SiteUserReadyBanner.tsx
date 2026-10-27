import { useEffect, useMemo } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useSiteUserReady } from '@/context/SiteUserReadyProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { subTargetsMatch } from '@/utils/readyBannerStorage';
import { readDeviceSceneSessionActive } from '@/utils/sessionAccessoryStorage';
import type { ActuatorKind } from '@/types/device';
import { useDeviceSceneSessionControls } from '@/hooks/useDeviceSceneSessionControls';
import { Button } from '@/components/ui/Button';

function SiteUserReadyBannerBody({
  sceneDeviceId,
  actuatorKind,
}: {
  sceneDeviceId: string;
  actuatorKind: ActuatorKind;
}) {
  const { user } = useAuth();
  const domTarget = user?.displayName ?? user?.username ?? '';
  const { notification, dismissReadyBannerForSub, isReadyBannerDismissedForSub } =
    useSiteUserReady();
  const { selectedSub } = useSubTarget();

  const {
    sceneSessionActive,
    sceneTogglePending,
    setSceneSessionActive,
    sceneSessionError,
  } = useDeviceSceneSessionControls(sceneDeviceId, actuatorKind);

  const accessoryActive =
    sceneSessionActive ||
    sceneTogglePending ||
    (domTarget && sceneDeviceId
      ? readDeviceSceneSessionActive(domTarget, selectedSub, sceneDeviceId)
      : false);

  const bannerDismissed = isReadyBannerDismissedForSub(selectedSub);

  useEffect(() => {
    if (!accessoryActive || !notification) {
      return;
    }

    if (subTargetsMatch(notification.subTarget, selectedSub)) {
      dismissReadyBannerForSub(selectedSub);
    }
  }, [accessoryActive, dismissReadyBannerForSub, notification, selectedSub]);

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
      <div className="min-w-0 flex-1 space-y-1">
        <span>{notification.message}</span>
        {sceneSessionError ? (
          <p className="text-xs text-amber-200" role="alert">{sceneSessionError}</p>
        ) : null}
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        {notification.requestStartFeed && !sceneSessionActive ? (
          <Button
            variant="primary"
            size="sm"
            disabled={sceneTogglePending}
            onClick={() => {
              dismissReadyBannerForSub(selectedSub);
              void setSceneSessionActive(true);
            }}
          >
            Start scene session
          </Button>
        ) : null}
        <Button
          variant="secondary"
          size="sm"
          onClick={() => dismissReadyBannerForSub(selectedSub)}
        >
          Dismiss
        </Button>
      </div>
    </div>
  );
}

export function SiteUserReadyBanner() {
  const { notification } = useSiteUserReady();
  const { selectedDeviceId, registrations } = useSubDevice();

  const sceneDeviceId = notification?.deviceId ?? selectedDeviceId ?? '';
  const registration = useMemo(
    () => registrations.find((row) => row.deviceId === sceneDeviceId),
    [registrations, sceneDeviceId],
  );

  if (!sceneDeviceId || !registration) {
    return null;
  }

  return (
    <SiteUserReadyBannerBody
      sceneDeviceId={sceneDeviceId}
      actuatorKind={registration.actuatorKind}
    />
  );
}
