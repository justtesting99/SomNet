import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SubTargetName } from '@/config/sessionUsers';
import { useAuth } from '@/context/AuthProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import {
  readDevicePresentAck,
  writeDevicePresentAck,
  writeSubPresentAck,
} from '@/utils/subPresentAckStorage';
import { readDeviceSceneSessionActive } from '@/utils/sessionAccessoryStorage';
import {
  readReadyBannerDismissed,
  subTargetsMatch,
  writeReadyBannerDismissed,
} from '@/utils/readyBannerStorage';

interface SiteUserReadyState {
  subTarget: string;
  deviceId?: string;
  message: string;
  requestStartFeed: boolean;
}

interface SiteUserReadyContextValue {
  notification: SiteUserReadyState | null;
  notifySiteUserReady: (
    subTarget: string,
    requestStartFeed: boolean,
    deviceId?: string,
  ) => void;
  clearNotification: () => void;
  dismissReadyBannerForSub: (subTarget: SubTargetName) => void;
  isReadyBannerDismissedForSub: (subTarget: SubTargetName) => boolean;
  isDevicePresentAcknowledged: (subTarget: SubTargetName, deviceId: string | null) => boolean;
  markDevicePresentAck: (subTarget: SubTargetName, deviceId: string) => void;
  clearDevicePresentAck: (subTarget: SubTargetName, deviceId: string) => void;
  /** @deprecated Use isDevicePresentAcknowledged */
  subPresentAckSub: SubTargetName | null;
  /** @deprecated Use markDevicePresentAck */
  markSubPresentAck: (subTarget: SubTargetName) => void;
  /** @deprecated Use clearDevicePresentAck */
  clearSubPresentAck: (subTarget?: SubTargetName) => void;
}

const SiteUserReadyContext = createContext<SiteUserReadyContextValue | null>(null);

export function SiteUserReadyProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { selectedSub } = useSubTarget();
  const domTarget = user?.displayName ?? user?.username ?? '';
  const [notification, setNotification] = useState<SiteUserReadyState | null>(null);
  const [presentAckRevision, setPresentAckRevision] = useState(0);
  const [dismissedSubs, setDismissedSubs] = useState<Set<string>>(() => new Set());

  const isDevicePresentAcknowledged = useCallback(
    (subTarget: SubTargetName, deviceId: string | null) => {
      void presentAckRevision;
      return readDevicePresentAck(subTarget, deviceId);
    },
    [presentAckRevision],
  );

  const notifySiteUserReady = useCallback(
    (subTarget: string, requestStartFeed: boolean, deviceId?: string) => {
      if (
        domTarget &&
        deviceId &&
        readDeviceSceneSessionActive(domTarget, subTarget, deviceId)
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
        deviceId,
        requestStartFeed,
        message: requestStartFeed
          ? `${subTarget} is Ready For Session.`
          : `Device button pressed on ${subTarget}.`,
      });
    },
    [domTarget],
  );

  const markDevicePresentAck = useCallback((subTarget: SubTargetName, deviceId: string) => {
    writeDevicePresentAck(subTarget, deviceId, true);
    setPresentAckRevision((value) => value + 1);
  }, []);

  const clearDevicePresentAck = useCallback((subTarget: SubTargetName, deviceId: string) => {
    writeDevicePresentAck(subTarget, deviceId, false);
    setPresentAckRevision((value) => value + 1);
  }, []);

  const markSubPresentAck = useCallback(
    (subTarget: SubTargetName) => {
      writeSubPresentAck(subTarget, true);
      setPresentAckRevision((value) => value + 1);
    },
    [],
  );

  const clearSubPresentAck = useCallback(
    (subTarget?: SubTargetName) => {
      const target = subTarget ?? selectedSub;
      writeSubPresentAck(target, false);
      setPresentAckRevision((value) => value + 1);
    },
    [selectedSub],
  );

  const subPresentAckSub = useMemo(() => {
    void presentAckRevision;
    return null;
  }, [presentAckRevision]);

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
      isDevicePresentAcknowledged,
      markDevicePresentAck,
      clearDevicePresentAck,
      subPresentAckSub,
      markSubPresentAck,
      clearSubPresentAck,
    }),
    [
      clearDevicePresentAck,
      clearNotification,
      clearSubPresentAck,
      dismissReadyBannerForSub,
      isDevicePresentAcknowledged,
      isReadyBannerDismissedForSub,
      markDevicePresentAck,
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
