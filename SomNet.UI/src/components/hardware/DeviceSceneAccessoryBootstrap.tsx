import { useEffect } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import {
  migrateSubSceneToDeviceIds,
} from '@/utils/sessionAccessoryStorage';
import { migrateSubPresentAckToDeviceIds } from '@/utils/subPresentAckStorage';

/** One-time storage migrations per Sub roster — no React scene/accessory state. */
export function DeviceSceneAccessoryBootstrap() {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const { registrations } = useSubDevice();
  const domTarget = user?.displayName ?? user?.username ?? '';

  useEffect(() => {
    if (!domTarget || registrations.length === 0) {
      return;
    }

    migrateSubSceneToDeviceIds(
      domTarget,
      selectedSub,
      registrations.map((row) => row.deviceId),
    );
    migrateSubPresentAckToDeviceIds(
      selectedSub,
      registrations.map((row) => row.deviceId),
    );
  }, [domTarget, registrations, selectedSub]);

  return null;
}
