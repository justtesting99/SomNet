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
  status: SystemStatusSnapshot;
  /** Relay device status when it differs from the header-selected device. */
  relayStatus: SystemStatusSnapshot | null;
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
  const { selectedDeviceId, relayRegistration } = useSubDevice();
  const [status, setStatus] = useState<SystemStatusSnapshot>(initialSystemStatus);
  const [relayStatus, setRelayStatus] = useState<SystemStatusSnapshot | null>(null);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setStatus((current) => ({
      ...current,
      api: current.api === 'unknown' ? 'connecting' : current.api,
      summary: current.lastChecked ? current.summary : 'Checking system status…',
    }));

    const relayDeviceId = relayRegistration?.deviceId ?? null;
    const needsRelayPoll =
      relayDeviceId !== null &&
      relayDeviceId !== selectedDeviceId &&
      relayDeviceId.length > 0;

    const [nextStatus, nextRelayStatus] = await Promise.all([
      fetchSystemStatus(selectedSub, selectedDeviceId),
      needsRelayPoll
        ? fetchSystemStatus(selectedSub, relayDeviceId)
        : Promise.resolve(null as SystemStatusSnapshot | null),
    ]);
    setStatus(nextStatus);
    setRelayStatus(nextRelayStatus);
  }, [enabled, relayRegistration?.deviceId, selectedSub, selectedDeviceId]);

  useEffect(() => {
    if (!enabled) {
      setStatus(initialSystemStatus);
      return;
    }

    void refresh();

    const intervalId = window.setInterval(() => {
      void refresh();
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(intervalId);
  }, [enabled, refresh]);

  const value = useMemo(
    () => ({
      status,
      relayStatus,
      refresh,
    }),
    [relayStatus, status, refresh],
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
