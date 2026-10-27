import { useMemo } from 'react';
import { useOperationDeviceId } from '@/context/DeviceOperationScope';
import { useLiveSession } from '@/context/SessionProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { sessionDeviceKey } from '@/utils/sessionDeviceKey';
import type { OperationMode } from '@/types/modes';

/** Session API bound to the device in the current DeviceOperationScope (or header selection). */
export function useOperationSession() {
  const deviceId = useOperationDeviceId();
  const { selectedSub } = useSubTarget();
  const session = useLiveSession();

  const activeSession = useMemo(() => {
    const key = sessionDeviceKey(selectedSub, deviceId);
    return session.sessionsByKey[key] ?? null;
  }, [deviceId, selectedSub, session.sessionsByKey]);

  return {
    activeSession,
    endAutomaticSession: (reason: string, deviceResult?: Parameters<typeof session.endAutomaticSessionForDevice>[3]) =>
      session.endAutomaticSessionForDevice(selectedSub, deviceId, reason, deviceResult),
    prepareManualSession: () => session.prepareManualSessionForDevice(deviceId),
    recordManualStroke: (powerPercent: number, actualStrokeMs?: number) =>
      session.recordManualStrokeForDevice(deviceId, powerPercent, actualStrokeMs),
    recordManualBurst: (
      powerPercent: number,
      burstStrokes: number,
      burstDelaySeconds: number,
      strokesCompleted?: number,
    ) =>
      session.recordManualBurstForDevice(
        deviceId,
        powerPercent,
        burstStrokes,
        burstDelaySeconds,
        strokesCompleted,
      ),
    recordManualAbort: () => session.recordManualAbortForDevice(deviceId),
    markAutomaticDeviceStarted: () => session.markAutomaticDeviceStartedForDevice(deviceId),
    syncActiveSessionMode: (mode: OperationMode) =>
      session.syncActiveSessionModeForDevice(deviceId, mode),
  };
}
