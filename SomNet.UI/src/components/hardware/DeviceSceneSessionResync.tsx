import { useEffect, useRef } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSystemStatus } from '@/context/SystemStatusProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { useSiteUserReady } from '@/context/SiteUserReadyProvider';
import { readDeviceSceneSessionActive } from '@/utils/sessionAccessoryStorage';
import { isHubLinkReady, resolveDeviceConnectionOnline } from '@/utils/commandReadiness';
import { pushDeviceSceneSessionIfWanted } from '@/utils/pushDeviceSceneSessionIfWanted';

const RESYNC_INTERVAL_MS = 2000;

/** Keep device scene aligned with UI storage across reconnect, hub toggle, and reboot. */
export function DeviceSceneSessionResync({ deviceId }: { deviceId: string }) {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const { registrations } = useSubDevice();
  const { getDeviceStatus } = useSystemStatus();
  const { deviceButtonReadySignal } = useSiteUserReady();
  const domTarget = user?.displayName ?? user?.username ?? '';

  const registration = registrations.find((row) => row.deviceId === deviceId);
  const deviceStatus = getDeviceStatus(deviceId);
  const hubReady = isHubLinkReady(deviceStatus);
  const deviceOnline = resolveDeviceConnectionOnline(registration, deviceStatus);

  const sceneWanted =
    Boolean(domTarget) && readDeviceSceneSessionActive(domTarget, selectedSub, deviceId);

  const syncedRef = useRef(false);

  useEffect(() => {
    if (!sceneWanted || !hubReady || !deviceOnline) {
      syncedRef.current = false;
      return;
    }

    syncedRef.current = false;
    let cancelled = false;

    const attempt = () => {
      if (cancelled || syncedRef.current || !domTarget) {
        return;
      }

      void pushDeviceSceneSessionIfWanted(domTarget, selectedSub, deviceId)
        .then(() => {
          syncedRef.current = true;
        })
        .catch(() => {
          syncedRef.current = false;
        });
    };

    attempt();
    const intervalId = window.setInterval(attempt, RESYNC_INTERVAL_MS);

    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    deviceButtonReadySignal?.atMs,
    deviceId,
    deviceOnline,
    domTarget,
    hubReady,
    sceneWanted,
    selectedSub,
  ]);

  return null;
}
