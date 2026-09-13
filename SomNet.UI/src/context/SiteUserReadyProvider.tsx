import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

interface SiteUserReadyState {
  subTarget: string;
  message: string;
  requestStartFeed: boolean;
}

interface SiteUserReadyContextValue {
  notification: SiteUserReadyState | null;
  notifySiteUserReady: (subTarget: string, requestStartFeed: boolean) => void;
  clearNotification: () => void;
}

const SiteUserReadyContext = createContext<SiteUserReadyContextValue | null>(null);

export function SiteUserReadyProvider({ children }: { children: ReactNode }) {
  const [notification, setNotification] = useState<SiteUserReadyState | null>(null);

  const notifySiteUserReady = useCallback((subTarget: string, requestStartFeed: boolean) => {
    setNotification({
      subTarget,
      requestStartFeed,
      message: requestStartFeed
        ? `${subTarget} is  Ready For Session.`
        : `Device button pressed on ${subTarget}.`,
    });
  }, []);

  const clearNotification = useCallback(() => {
    setNotification(null);
  }, []);

  const value = useMemo(
    (): SiteUserReadyContextValue => ({
      notification,
      notifySiteUserReady,
      clearNotification,
    }),
    [clearNotification, notification, notifySiteUserReady],
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
