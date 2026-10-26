import { useEffect, useState } from 'react';
import type { SubTargetName } from '@/config/sessionUsers';
import { fetchDeviceStatus } from '@/api/devices';
import type { ActuatorKind } from '@/types/device';

export function useDeviceActuatorKind(subTarget: SubTargetName): ActuatorKind | null {
  const [kind, setKind] = useState<ActuatorKind | null>(null);

  useEffect(() => {
    let cancelled = false;
    setKind(null);
    void fetchDeviceStatus(subTarget)
      .then((status) => {
        if (!cancelled) {
          setKind(status.actuatorKind ?? 'relay');
        }
      })
      .catch(() => {
        if (!cancelled) {
          setKind('relay');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [subTarget]);

  return kind;
}
