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
