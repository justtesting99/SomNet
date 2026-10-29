import { useEffect, useRef } from 'react';
import type { ActuatorKind } from '@/types/device';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSystemStatus } from '@/context/SystemStatusProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { sendHardwareCommand } from '@/services/hardwareCommand';
import { readDeviceAccessoryEngaged } from '@/utils/sessionAccessoryStorage';
import { useAuth } from '@/context/AuthProvider';
import { isHubLinkReady, resolveDeviceConnectionOnline } from '@/utils/commandReadiness';
import { useDeviceSceneSessionActive } from '@/hooks/useDeviceSceneSessionActive';

/** Re-send accessory ON after device reconnect when UI storage says engaged. */
export function DeviceAccessoryResync({
  deviceId,
}: {
  deviceId: string;
  actuatorKind: ActuatorKind;
}) {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const { registrations } = useSubDevice();
  const { getDeviceStatus } = useSystemStatus();
  const domTarget = user?.displayName ?? user?.username ?? '';
  const sceneSessionActive = useDeviceSceneSessionActive(deviceId);

  const registration = registrations.find((row) => row.deviceId === deviceId);
  const deviceStatus = getDeviceStatus(deviceId);
  const hubReady = isHubLinkReady(deviceStatus);
  const deviceOnline = resolveDeviceConnectionOnline(registration, deviceStatus);

  const accessoryEngaged =
    domTarget && readDeviceAccessoryEngaged(domTarget, selectedSub, deviceId);

  const syncedKeyRef = useRef<string | null>(null);
  const wasOnlineRef = useRef(false);

  useEffect(() => {
    if (!accessoryEngaged || !sceneSessionActive || !hubReady || !deviceOnline) {
      if (!deviceOnline) {
        wasOnlineRef.current = false;
      }
      return;
    }

    const syncKey = `${selectedSub}:${deviceId}`;
    const justConnected = !wasOnlineRef.current;
    wasOnlineRef.current = true;

    if (!justConnected && syncedKeyRef.current === syncKey) {
      return;
    }

    const timer = window.setTimeout(() => {
      void sendHardwareCommand(
        selectedSub,
        deviceId,
        HARDWARE_COMMAND_KEYS.sessionAccessory,
        JSON.stringify({ enabled: true }),
      )
        .then(() => {
          syncedKeyRef.current = syncKey;
        })
        .catch(() => {
          syncedKeyRef.current = null;
        });
    }, 400);

    return () => {
      window.clearTimeout(timer);
    };
  }, [
    accessoryEngaged,
    deviceId,
    deviceOnline,
    hubReady,
    sceneSessionActive,
    selectedSub,
  ]);

  useEffect(() => {
    if (!accessoryEngaged) {
      syncedKeyRef.current = null;
      wasOnlineRef.current = false;
    }
  }, [accessoryEngaged, deviceId, selectedSub]);

  return null;
}
