import { formatSessionDateTimeDisplay } from '@/utils/dateTimeLocal';

/** Matches firmware/API delivery buffer (Phase 7). */
export const DEVICE_TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/** Show a proactive warning when expiry is within this window. */
export const DEVICE_TOKEN_EXPIRY_WARN_MS = 30 * 24 * 60 * 60 * 1000;

export type DeviceTokenExpiryUrgency = 'ok' | 'warn' | 'expired';

export interface DeviceTokenExpiryInfo {
  serverExpiresMs: number;
  effectiveExpiresMs: number;
  formattedServerExpiry: string;
  formattedEffectiveExpiry: string;
  daysRemaining: number;
  urgency: DeviceTokenExpiryUrgency;
}

export function getDeviceTokenExpiryInfo(
  tokenExpiresAt: string | null | undefined,
  nowMs: number = Date.now(),
): DeviceTokenExpiryInfo | null {
  if (!tokenExpiresAt) {
    return null;
  }

  const serverExpiresMs = Date.parse(tokenExpiresAt);
  if (Number.isNaN(serverExpiresMs)) {
    return null;
  }

  const effectiveExpiresMs = serverExpiresMs - DEVICE_TOKEN_EXPIRY_BUFFER_MS;
  const msUntilEffective = effectiveExpiresMs - nowMs;
  const daysRemaining = Math.ceil(msUntilEffective / (24 * 60 * 60 * 1000));

  let urgency: DeviceTokenExpiryUrgency = 'ok';
  if (msUntilEffective <= 0) {
    urgency = 'expired';
  } else if (msUntilEffective <= DEVICE_TOKEN_EXPIRY_WARN_MS) {
    urgency = 'warn';
  }

  return {
    serverExpiresMs,
    effectiveExpiresMs,
    formattedServerExpiry: formatSessionDateTimeDisplay(tokenExpiresAt),
    formattedEffectiveExpiry: formatSessionDateTimeDisplay(
      new Date(effectiveExpiresMs).toISOString(),
    ),
    daysRemaining,
    urgency,
  };
}
