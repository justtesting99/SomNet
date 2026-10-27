import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import type { SystemStatusResponse, SystemStatusSnapshot } from '@/types/systemStatus';
import { initialSystemStatus } from '@/types/systemStatus';
import { buildSystemStatus } from '@/utils/systemStatus';
import { apiFetch } from '@/api/client';
import { useSubTarget } from '@/context/SubTargetProvider';
import { useSubDevice } from '@/context/SubDeviceProvider';

const STATUS_ENDPOINT = '/api/system/status';
const POLL_INTERVAL_MS = 10_000;

interface SystemStatusContextValue {
  /** Focus device status (header / video shell). */
  status: SystemStatusSnapshot;
  getDeviceStatus: (deviceId: string) => SystemStatusSnapshot;
  refresh: () => Promise<void>;
}

const SystemStatusContext = createContext<SystemStatusContextValue | null>(null);

async function fetchSystemStatus(
  subTarget: string,
  deviceId: string | null,
): Promise<SystemStatusSnapshot> {
  try {
    const params = new URLSearchParams();
    if (subTarget) {
      params.set('subTarget', subTarget);
    }
    if (deviceId) {
      params.set('deviceId', deviceId);
    }

    const payload = await apiFetch<SystemStatusResponse>(
      `${STATUS_ENDPOINT}?${params.toString()}`,
    );
    return buildSystemStatus(payload, true);
  } catch {
    return buildSystemStatus(null, false);
  }
}

export function SystemStatusProvider({
  children,
  enabled = true,
}: {
  children: ReactNode;
  enabled?: boolean;
}) {
  const { selectedSub } = useSubTarget();
  const { selectedDeviceId, registrations } = useSubDevice();
  const [statusByDeviceId, setStatusByDeviceId] = useState<Record<string, SystemStatusSnapshot>>(
    {},
  );

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }

    const deviceIds = registrations.map((row) => row.deviceId);
    if (deviceIds.length === 0) {
      setStatusByDeviceId({});
      return;
    }

    const results = await Promise.all(
      deviceIds.map(async (deviceId) => {
        const snapshot = await fetchSystemStatus(selectedSub, deviceId);
        return [deviceId, snapshot] as const;
      }),
    );

    const next: Record<string, SystemStatusSnapshot> = {};
    for (const [deviceId, snapshot] of results) {
      next[deviceId] = snapshot;
    }
    setStatusByDeviceId(next);
  }, [enabled, registrations, selectedSub]);

  useEffect(() => {
    if (!enabled) {
      setStatusByDeviceId({});
      return;
    }

    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [enabled, refresh]);

  const getDeviceStatus = useCallback(
    (deviceId: string): SystemStatusSnapshot => {
      return statusByDeviceId[deviceId] ?? initialSystemStatus;
    },
    [statusByDeviceId],
  );

  const status = useMemo(() => {
    if (selectedDeviceId && statusByDeviceId[selectedDeviceId]) {
      return statusByDeviceId[selectedDeviceId];
    }

    const first = registrations[0]?.deviceId;
    if (first && statusByDeviceId[first]) {
      return statusByDeviceId[first];
    }

    return initialSystemStatus;
  }, [registrations, selectedDeviceId, statusByDeviceId]);

  const value = useMemo(
    () => ({
      status,
      getDeviceStatus,
      refresh,
    }),
    [getDeviceStatus, refresh, status],
  );

  return (
    <SystemStatusContext.Provider value={value}>{children}</SystemStatusContext.Provider>
  );
}

export function useSystemStatus(): SystemStatusContextValue {
  const context = useContext(SystemStatusContext);
  if (!context) {
    throw new Error('useSystemStatus must be used within a SystemStatusProvider');
  }
  return context;
}
