import type { ActuatorKind } from '@/types/device';
import { useRelayModeChange } from '@/hooks/useRelayModeChange';
import { useMotorModeChange } from '@/hooks/useMotorModeChange';

/** Stops cooperative automatic on this device before switching manual/automatic. */
export function useDeviceModeChange(deviceId: string, actuatorKind: ActuatorKind) {
  const changeRelayMode = useRelayModeChange(deviceId);
  const changeMotorMode = useMotorModeChange(deviceId);
  return actuatorKind === 'hbridge' ? changeMotorMode : changeRelayMode;
}
