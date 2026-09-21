import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SubTargetName } from '@/config/sessionUsers';
import { useAuth } from '@/context/AuthProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import { readSubPresentAck, writeSubPresentAck } from '@/utils/subPresentAckStorage';
import { readSessionAccessoryInProgress } from '@/utils/sessionAccessoryStorage';
import {
  readReadyBannerDismissed,
  subTargetsMatch,
  writeReadyBannerDismissed,
} from '@/utils/readyBannerStorage';

interface SiteUserReadyState {
  subTarget: string;
  message: string;
  requestStartFeed: boolean;
}

interface SiteUserReadyContextValue {
  notification: SiteUserReadyState | null;
  notifySiteUserReady: (subTarget: string, requestStartFeed: boolean) => void;
  clearNotification: () => void;
  /** Hide “Ready for session” when Session in Progress starts (same as Dismiss). */
  dismissReadyBannerForSub: (subTarget: SubTargetName) => void;
  isReadyBannerDismissedForSub: (subTarget: SubTargetName) => boolean;
  /** Sub double-click ack for Session in Progress (P16-D1). Persists per Sub until Sub changes. */
  subPresentAckSub: SubTargetName | null;
  markSubPresentAck: (subTarget: SubTargetName) => void;
  clearSubPresentAck: (subTarget?: SubTargetName) => void;
}

const SiteUserReadyContext = createContext<SiteUserReadyContextValue | null>(null);

export function SiteUserReadyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const domTarget = user?.displayName ?? user?.username ?? '';
  const [notification, setNotification] = useState<SiteUserReadyState | null>(null);
  const [subPresentAckSub, setSubPresentAckSub] = useState<SubTargetName | null>(() =>
    readSubPresentAck(selectedSub) ? selectedSub : null,
  );
  const [dismissedSubs, setDismissedSubs] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    setSubPresentAckSub(readSubPresentAck(selectedSub) ? selectedSub : null);
  }, [selectedSub]);

  const notifySiteUserReady = useCallback(
    (subTarget: string, requestStartFeed: boolean) => {
      if (
        domTarget &&
        readSessionAccessoryInProgress(domTarget, subTarget)
      ) {
        return;
      }

      writeReadyBannerDismissed(subTarget, false);
      setDismissedSubs((current) => {
        const next = new Set(current);
        next.delete(subTarget.trim().toLowerCase());
        return next;
      });
      setNotification({
        subTarget,
        requestStartFeed,
        message: requestStartFeed
          ? `${subTarget} is  Ready For Session.`
          : `Device button pressed on ${subTarget}.`,
      });
    },
    [domTarget],
  );

  const markSubPresentAck = useCallback((subTarget: SubTargetName) => {
    writeSubPresentAck(subTarget, true);
    setSubPresentAckSub(subTarget);
  }, []);

  const clearSubPresentAck = useCallback((subTarget?: SubTargetName) => {
    const target = subTarget ?? selectedSub;
    writeSubPresentAck(target, false);
    setSubPresentAckSub((current) => (current === target ? null : current));
  }, [selectedSub]);

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  const dismissReadyBannerForSub = useCallback((subTarget: SubTargetName) => {
    const key = subTarget.trim().toLowerCase();
    writeReadyBannerDismissed(subTarget, true);
    setDismissedSubs((current) => new Set(current).add(key));
    setNotification((current) => {
      if (!current || !subTargetsMatch(current.subTarget, subTarget)) {
        return current;
      }

      return null;
    });
  }, []);

  const isReadyBannerDismissedForSub = useCallback(
    (subTarget: SubTargetName) => {
      const key = subTarget.trim().toLowerCase();
      return dismissedSubs.has(key) || readReadyBannerDismissed(subTarget);
    },
    [dismissedSubs],
  );

  const value = useMemo(
    (): SiteUserReadyContextValue => ({
      notification,
      notifySiteUserReady,
      clearNotification,
      dismissReadyBannerForSub,
      isReadyBannerDismissedForSub,
      subPresentAckSub,
      markSubPresentAck,
      clearSubPresentAck,
    }),
    [
      clearNotification,
      clearSubPresentAck,
      dismissReadyBannerForSub,
      isReadyBannerDismissedForSub,
      markSubPresentAck,
      notification,
      notifySiteUserReady,
      subPresentAckSub,
    ],
  );

  return (
    <SiteUserReadyContext.Provider value={value}>{children}</SiteUserReadyContext.Provider>
  );
}

export function useSiteUserReady(): SiteUserReadyContextValue {
  const context = useContext(SiteUserReadyContext);
  if (!context) {
    throw new Error('useSiteUserReady must be used within SiteUserReadyProvider');
  }

  return context;
}
