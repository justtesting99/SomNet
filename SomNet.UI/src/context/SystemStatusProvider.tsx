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

const STATUS_ENDPOINT = '/api/system/status';
const POLL_INTERVAL_MS = 10_000;

interface SystemStatusContextValue {
  status: SystemStatusSnapshot;
  refresh: () => Promise<void>;
}

const SystemStatusContext = createContext<SystemStatusContextValue | null>(null);

async function fetchSystemStatus(subTarget: string): Promise<SystemStatusSnapshot> {
  try {
    const params = new URLSearchParams({ subTarget });
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
  const [status, setStatus] = useState<SystemStatusSnapshot>(initialSystemStatus);

  const refresh = useCallback(async () => {
    if (!enabled) {
      return;
    }

    setStatus((current) => ({
      ...current,
      api: current.api === 'unknown' ? 'connecting' : current.api,
      summary: current.lastChecked ? current.summary : 'Checking system status…',
    }));

    const nextStatus = await fetchSystemStatus(selectedSub);
    setStatus(nextStatus);
  }, [enabled, selectedSub]);

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
      refresh,
    }),
    [status, refresh],
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
