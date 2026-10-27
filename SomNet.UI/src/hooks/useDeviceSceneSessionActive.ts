import { useCallback, useSyncExternalStore } from 'react';
import { useAuth } from '@/context/AuthProvider';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import {
  readDeviceSceneSessionActive,
  subscribeDeviceSceneSessionStorage,
} from '@/utils/sessionAccessoryStorage';
import { sessionDeviceKey } from '@/utils/sessionDeviceKey';
import { subscribeTabSync } from '@/utils/tabSync';

export function useDeviceSceneSessionActive(deviceId: string): boolean {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const { sessionsByKey } = useLiveSession();
  const domTarget = user?.displayName ?? user?.username ?? '';

  const subscribe = useCallback((onStoreChange: () => void) => {
    const unsubStorage = subscribeDeviceSceneSessionStorage(onStoreChange);
    const unsubTab = subscribeTabSync((message) => {
      if (message.type === 'scene-session') {
        onStoreChange();
      }
    });

    return () => {
      unsubStorage();
      unsubTab();
    };
  }, []);

  const getSnapshot = useCallback(() => {
    if (!domTarget || !deviceId) {
      return false;
    }

    return readDeviceSceneSessionActive(domTarget, selectedSub, deviceId);
  }, [deviceId, domTarget, selectedSub]);

  const storageActive = useSyncExternalStore(subscribe, getSnapshot, () => false);

  const sessionActive = deviceId
    ? Boolean(sessionsByKey[sessionDeviceKey(selectedSub, deviceId)])
    : false;

  return storageActive || sessionActive;
}
