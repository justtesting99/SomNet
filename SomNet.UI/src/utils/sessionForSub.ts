import type { SubTargetName } from '@/config/sessionUsers';
import { subTargetsMatch } from '@/utils/readyBannerStorage';

/** Live session row applies only when it belongs to the selected Sub (dual-device bench). */
export function activeSessionForSub<T extends { subTarget: string }>(
  session: T | null,
  selectedSub: SubTargetName,
): T | null {
  if (!session || !subTargetsMatch(session.subTarget, selectedSub)) {
    return null;
  }
  return session;
}

/** V2 — scene session row for the selected device (legacy rows without deviceId still match). */
export function activeSessionForSubAndDevice<
  T extends { subTarget: string; deviceId?: string | null },
>(
  session: T | null,
  selectedSub: SubTargetName,
  selectedDeviceId: string | null | undefined,
): T | null {
  const forSub = activeSessionForSub(session, selectedSub);
  if (!forSub || !selectedDeviceId) {
    return null;
  }

  if (forSub.deviceId && forSub.deviceId !== selectedDeviceId) {
    return null;
  }

  return forSub;
}
