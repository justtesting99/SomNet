import { useEffect, useState } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { readDeviceSceneSessionActive } from '@/utils/sessionAccessoryStorage';
import { subscribeTabSync } from '@/utils/tabSync';

export function useDeviceSceneSessionActive(deviceId: string): boolean {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const domTarget = user?.displayName ?? user?.username ?? '';

  const [active, setActive] = useState(() =>
    domTarget ? readDeviceSceneSessionActive(domTarget, selectedSub, deviceId) : false,
  );

  useEffect(() => {
    const read = () => {
      setActive(domTarget ? readDeviceSceneSessionActive(domTarget, selectedSub, deviceId) : false);
    };

    read();
    return subscribeTabSync((message) => {
      if (
        message.type === 'scene-session' &&
        message.subTarget === selectedSub &&
        message.deviceId === deviceId
      ) {
        read();
      }
    });
  }, [deviceId, domTarget, selectedSub]);

  return active;
}
