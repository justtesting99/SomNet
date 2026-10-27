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
import { readReadyBannerDismissed, writeReadyBannerDismissed } from '@/utils/readyBannerStorage';

export interface DeviceButtonReadySignal {
  subTarget: string;
  deviceId: string;
  requestStartFeed: boolean;
  atMs: number;
}

interface SiteUserReadyContextValue {
  deviceButtonReadySignal: DeviceButtonReadySignal | null;
  notifySiteUserReady: (
    subTarget: string,
    requestStartFeed: boolean,
    deviceId?: string,
  ) => void;
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
  const [deviceButtonReadySignal, setDeviceButtonReadySignal] =
    useState<DeviceButtonReadySignal | null>(null);
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

      if (!deviceId) {
        return;
      }

      setDeviceButtonReadySignal({
        subTarget,
        deviceId,
        requestStartFeed,
        atMs: Date.now(),
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

  const dismissReadyBannerForSub = useCallback((subTarget: SubTargetName) => {
    const key = subTarget.trim().toLowerCase();
    writeReadyBannerDismissed(subTarget, true);
    setDismissedSubs((current) => new Set(current).add(key));
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
      deviceButtonReadySignal,
      notifySiteUserReady,
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
      clearSubPresentAck,
      deviceButtonReadySignal,
      dismissReadyBannerForSub,
      isDevicePresentAcknowledged,
      isReadyBannerDismissedForSub,
      markDevicePresentAck,
      markSubPresentAck,
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
