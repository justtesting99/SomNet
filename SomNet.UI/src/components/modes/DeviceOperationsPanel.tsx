import { useMemo } from 'react';
import type { DeviceRegistration } from '@/types/device';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { DeviceOperationScope } from '@/context/DeviceOperationScope';
import { useDeviceOperationMode } from '@/context/DeviceOperationModeProvider';
import { Panel } from '@/components/ui/Panel';
import { ManualControls } from '@/components/modes/ManualControls';
import { MotorManualControls } from '@/components/modes/MotorManualControls';
import { AutomaticControls } from '@/components/modes/AutomaticControls';
import { MotorAutomaticControls } from '@/components/modes/MotorAutomaticControls';
import { DeviceAccessoryResync } from '@/components/hardware/DeviceAccessoryResync';
import { DeviceSubSessionControls } from '@/components/hardware/DeviceSubSessionControls';
import { DeviceModeToggle } from '@/components/modes/DeviceModeToggle';
import { DeviceTabSyncLockBanner } from '@/components/hardware/DeviceTabSyncLockBanner';
import { useSystemStatus } from '@/context/SystemStatusProvider';
import { resolveDeviceConnectionLabel } from '@/utils/commandReadiness';

function sortRegistrations(rows: DeviceRegistration[]): DeviceRegistration[] {
  return [...rows].sort((a, b) => {
    if (a.actuatorKind === b.actuatorKind) {
      return a.deviceId.localeCompare(b.deviceId);
    }

    if (a.actuatorKind === 'relay') {
      return -1;
    }

    if (b.actuatorKind === 'relay') {
      return 1;
    }

    return a.deviceId.localeCompare(b.deviceId);
  });
}

function deviceSectionTitle(
  registration: DeviceRegistration,
  connection: 'online' | 'offline' | 'connecting' | 'unknown',
): string {
  const kindLabel = registration.actuatorKind === 'hbridge' ? 'Motor' : 'Relay';
  const connectionLabel =
    connection === 'connecting' ? 'connecting' : connection === 'online' ? 'online' : 'offline';
  return `${kindLabel} · ${registration.deviceId} (${connectionLabel})`;
}

function DeviceOperationSection({ registration }: { registration: DeviceRegistration }) {
  const { getDeviceStatus } = useSystemStatus();
  const connection = resolveDeviceConnectionLabel(registration, getDeviceStatus(registration.deviceId));
  const { mode, needsModeChoice } = useDeviceOperationMode(
    registration.deviceId,
    registration.actuatorKind,
  );

  return (
    <DeviceOperationScope
      deviceId={registration.deviceId}
      actuatorKind={registration.actuatorKind}
    >
      <DeviceAccessoryResync
        deviceId={registration.deviceId}
        actuatorKind={registration.actuatorKind}
      />
      <Panel title={deviceSectionTitle(registration, connection)} className="border-slate-800/80">
        <div className="space-y-4">
          <DeviceTabSyncLockBanner deviceId={registration.deviceId} />
          <DeviceModeToggle deviceId={registration.deviceId} actuatorKind={registration.actuatorKind} />
          <DeviceSubSessionControls
            deviceId={registration.deviceId}
            actuatorKind={registration.actuatorKind}
          />
          {needsModeChoice ? null : mode === 'manual' ? (
            registration.actuatorKind === 'hbridge' ? (
              <MotorManualControls />
            ) : (
              <ManualControls />
            )
          ) : registration.actuatorKind === 'hbridge' ? (
            <MotorAutomaticControls />
          ) : (
            <AutomaticControls />
          )}
        </div>
      </Panel>
    </DeviceOperationScope>
  );
}

/** Operations for the header Focus device (one independent instance at a time). */
export function DeviceOperationsPanel() {
  const { registrations, isLoading, selectedDeviceId } = useSubDevice();

  const visibleRegistrations = useMemo(() => {
    const ordered = sortRegistrations(registrations);
    if (!selectedDeviceId) {
      return ordered;
    }

    const focused = ordered.filter((row) => row.deviceId === selectedDeviceId);
    return focused.length > 0 ? focused : ordered;
  }, [registrations, selectedDeviceId]);

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading devices…</p>;
  }

  if (registrations.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No paired device for this Sub. Pair hardware in Options → Hardware.
      </p>
    );
  }

  if (!selectedDeviceId) {
    return (
      <p className="text-sm text-slate-500">
        Select a device in the header Focus control to operate this Sub.
      </p>
    );
  }

  return (
    <div className="space-y-4" data-ui="device-operations-panel">
      {visibleRegistrations.map((registration) => (
        <DeviceOperationSection key={registration.deviceId} registration={registration} />
      ))}
    </div>
  );
}
