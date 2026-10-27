import { AutomaticControls } from '@/components/modes/AutomaticControls';
import { MotorAutomaticControls } from '@/components/modes/MotorAutomaticControls';
import { useDeviceActuatorKind } from '@/hooks/useDeviceActuatorKind';

export function AutomaticModeControls() {
  const { actuatorKind, isLoading, hasDevice } = useDeviceActuatorKind();

  if (isLoading) {
    return <p className="text-sm text-slate-500">Loading device profile…</p>;
  }

  if (!hasDevice || actuatorKind === null) {
    return (
      <p className="text-sm text-slate-500">
        No paired device for this Sub. Pair hardware in Options → Hardware.
      </p>
    );
  }

  if (actuatorKind === 'hbridge') {
    return <MotorAutomaticControls />;
  }

  return <AutomaticControls />;
}
