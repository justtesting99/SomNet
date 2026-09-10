import { sendHardwareCommand } from '@/api/devices';
import type { SubTargetName } from '@/config/sessionUsers';
import type { AutomaticControlState } from '@/types/modes';
import { HARDWARE_COMMAND_KEYS } from '@/types/hardwareCommand';
import { buildAutomaticStartPayload } from '@/utils/automaticStartPayload';

export function isDeviceAutomaticIdleMessage(message?: string | null): boolean {
  const normalized = (message ?? '').toLowerCase();
  return normalized.includes('no automatic session running');
}

/**
 * Returns true when the device still has an active automatic session.
 * Uses automatic-update accept/reject — may queue a same-config replan when true.
 */
export async function probeDeviceAutomaticSessionActive(
  subTarget: SubTargetName,
  automatic: AutomaticControlState,
): Promise<boolean | null> {
  try {
    const response = await sendHardwareCommand(
      subTarget,
      HARDWARE_COMMAND_KEYS.automaticUpdate,
      buildAutomaticStartPayload(automatic),
    );

    if (response.success) {
      return true;
    }

    if (isDeviceAutomaticIdleMessage(response.message)) {
      return false;
    }

    return null;
  } catch {
    return null;
  }
}

export const STALE_AUTOMATIC_SESSION_SUMMARY =
  'Automatic session closed (device idle — stale server record).';
