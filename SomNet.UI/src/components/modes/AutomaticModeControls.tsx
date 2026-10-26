import { AutomaticControls } from '@/components/modes/AutomaticControls';
import { MotorAutomaticControls } from '@/components/modes/MotorAutomaticControls';
import { useDeviceActuatorKind } from '@/hooks/useDeviceActuatorKind';
import { useSubTarget } from '@/context/SubTargetProvider';

export function AutomaticModeControls() {
  const { selectedSub } = useSubTarget();
  const actuatorKind = useDeviceActuatorKind(selectedSub);

  if (actuatorKind === null) {
    return <p className="text-sm text-slate-500">Loading device profile…</p>;
  }

  if (actuatorKind === 'hbridge') {
    return <MotorAutomaticControls />;
  }

  return <AutomaticControls />;
}
