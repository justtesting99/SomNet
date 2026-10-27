import { useMemo } from 'react';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { sessionDeviceKey } from '@/utils/sessionDeviceKey';
import type { ActiveSessionState } from '@/context/SessionProvider';

/** Focus-device session — video shell and header only; motion controls use `useOperationSession`. */
export function useFocusSession(): ActiveSessionState | null {
  const { selectedDeviceId } = useSubDevice();
  const { selectedSub } = useSubTarget();
  const { sessionsByKey } = useLiveSession();

  return useMemo(() => {
    if (!selectedDeviceId) {
      return null;
    }

    return sessionsByKey[sessionDeviceKey(selectedSub, selectedDeviceId)] ?? null;
  }, [selectedDeviceId, selectedSub, sessionsByKey]);
}
