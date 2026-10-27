import type { DeviceRegistration } from '@/types/device';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { DeviceOperationScope } from '@/context/DeviceOperationScope';
import { useDeviceOperationMode } from '@/context/DeviceOperationModeProvider';
import { Panel } from '@/components/ui/Panel';
import { ManualControls } from '@/components/modes/ManualControls';
import { AutomaticControls } from '@/components/modes/AutomaticControls';
import { MotorAutomaticControls } from '@/components/modes/MotorAutomaticControls';
import { DeviceAccessoryResync } from '@/components/hardware/DeviceAccessoryResync';
import { DeviceSubSessionControls } from '@/components/hardware/DeviceSubSessionControls';
import { DeviceModeToggle } from '@/components/modes/DeviceModeToggle';

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

function deviceSectionTitle(registration: DeviceRegistration): string {
  const kindLabel = registration.actuatorKind === 'hbridge' ? 'Motor' : 'Relay';
  const connection = registration.isConnected ? 'online' : 'offline';
  return `${kindLabel} · ${registration.deviceId} (${connection})`;
}

function DeviceOperationSection({ registration }: { registration: DeviceRegistration }) {
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
      <Panel title={deviceSectionTitle(registration)} className="border-slate-800/80">
        <div className="space-y-4">
          <DeviceModeToggle deviceId={registration.deviceId} actuatorKind={registration.actuatorKind} />
          <DeviceSubSessionControls
            deviceId={registration.deviceId}
            actuatorKind={registration.actuatorKind}
          />
          {needsModeChoice ? null : mode === 'manual' ? (
            <ManualControls />
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

/** One dashboard panel — each paired device is an independent operator instance. */
export function DeviceOperationsPanel() {
  const { registrations, isLoading } = useSubDevice();

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

  const ordered = sortRegistrations(registrations);

  return (
    <div className="space-y-4" data-ui="device-operations-panel">
      {ordered.map((registration) => (
        <DeviceOperationSection key={registration.deviceId} registration={registration} />
      ))}
    </div>
  );
}
