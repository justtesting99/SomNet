import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import type { SubTargetName } from '@/config/sessionUsers';
import { fetchDeviceRegistrations } from '@/api/devices';
import type { ActuatorKind, DeviceRegistration } from '@/types/device';
import { useSubTarget } from '@/context/SubTargetProvider';

const SELECTED_DEVICE_STORAGE_KEY = 'somnet-selected-device-id';

function readStoredDeviceId(subTarget: SubTargetName): string | null {
  try {
    const raw = sessionStorage.getItem(SELECTED_DEVICE_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw) as Record<string, string>;
    const value = parsed[subTarget];
    return typeof value === 'string' && value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function writeStoredDeviceId(subTarget: SubTargetName, deviceId: string | null) {
  try {
    const raw = sessionStorage.getItem(SELECTED_DEVICE_STORAGE_KEY);
    const parsed: Record<string, string> = raw ? (JSON.parse(raw) as Record<string, string>) : {};
    if (deviceId) {
      parsed[subTarget] = deviceId;
    } else {
      delete parsed[subTarget];
    }
    sessionStorage.setItem(SELECTED_DEVICE_STORAGE_KEY, JSON.stringify(parsed));
  } catch {
    // ignore
  }
}

interface SubDeviceContextValue {
  registrations: DeviceRegistration[];
  selectedDeviceId: string | null;
  setSelectedDeviceId: (deviceId: string | null) => void;
  selectedRegistration: DeviceRegistration | null;
  relayRegistration: DeviceRegistration | null;
  selectedActuatorKind: ActuatorKind | null;
  isLoading: boolean;
  refresh: () => Promise<void>;
}

const SubDeviceContext = createContext<SubDeviceContextValue | null>(null);

export function SubDeviceProvider({ children }: { children: ReactNode }) {
  const { selectedSub } = useSubTarget();
  const [registrations, setRegistrations] = useState<DeviceRegistration[]>([]);
  const [selectedDeviceId, setSelectedDeviceIdState] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const selectedSubRef = useRef(selectedSub);
  selectedSubRef.current = selectedSub;

  const pickDefaultDeviceId = useCallback(
    (rows: DeviceRegistration[]): string | null => {
      if (rows.length === 0) {
        return null;
      }

      const stored = readStoredDeviceId(selectedSubRef.current);
      if (stored && rows.some((row) => row.deviceId === stored)) {
        return stored;
      }

      return rows[0]?.deviceId ?? null;
    },
    [],
  );

  const refresh = useCallback(async () => {
    setIsLoading(true);
    try {
      const rows = await fetchDeviceRegistrations(selectedSubRef.current);
      setRegistrations(rows);
      setSelectedDeviceIdState((current) => {
        if (current && rows.some((row) => row.deviceId === current)) {
          return current;
        }
        return pickDefaultDeviceId(rows);
      });
    } catch {
      setRegistrations([]);
      setSelectedDeviceIdState(null);
    } finally {
      setIsLoading(false);
    }
  }, [pickDefaultDeviceId]);

  useEffect(() => {
    void refresh();
  }, [selectedSub, refresh]);

  const setSelectedDeviceId = useCallback(
    (deviceId: string | null) => {
      setSelectedDeviceIdState(deviceId);
      writeStoredDeviceId(selectedSubRef.current, deviceId);
    },
    [],
  );

  const selectedRegistration = useMemo(
    () => registrations.find((row) => row.deviceId === selectedDeviceId) ?? null,
    [registrations, selectedDeviceId],
  );

  const relayRegistration = useMemo(
    () => registrations.find((row) => row.actuatorKind === 'relay') ?? null,
    [registrations],
  );

  const value = useMemo(
    (): SubDeviceContextValue => ({
      registrations,
      selectedDeviceId,
      setSelectedDeviceId,
      selectedRegistration,
      relayRegistration,
      selectedActuatorKind: selectedRegistration?.actuatorKind ?? null,
      isLoading,
      refresh,
    }),
    [
      registrations,
      selectedDeviceId,
      setSelectedDeviceId,
      selectedRegistration,
      relayRegistration,
      isLoading,
      refresh,
    ],
  );

  return <SubDeviceContext.Provider value={value}>{children}</SubDeviceContext.Provider>;
}

export function useSubDevice(): SubDeviceContextValue {
  const context = useContext(SubDeviceContext);
  if (!context) {
    throw new Error('useSubDevice must be used within a SubDeviceProvider');
  }
  return context;
}

/** Resolved deviceId for hardware commands — throws if none selected. */
export function useCommandDeviceId(): string {
  const { selectedDeviceId, registrations } = useSubDevice();
  if (!selectedDeviceId) {
    throw new Error(
      registrations.length === 0
        ? 'No device paired for this Sub. Pair hardware in Options.'
        : 'Select a device for this Sub.',
    );
  }
  return selectedDeviceId;
}
