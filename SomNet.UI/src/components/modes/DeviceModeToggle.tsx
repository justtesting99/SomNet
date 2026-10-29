import type { OperationMode } from '@/types/modes';
import type { ActuatorKind } from '@/types/device';
import { useDeviceOperationMode } from '@/context/DeviceOperationModeProvider';
import { useDeviceModeChange } from '@/hooks/useDeviceModeChange';
import { Button } from '@/components/ui/Button';

interface DeviceModeToggleProps {
  deviceId: string;
  actuatorKind: ActuatorKind;
}

export function DeviceModeToggle({ deviceId, actuatorKind }: DeviceModeToggleProps) {
  const { mode, needsModeChoice, setMode } = useDeviceOperationMode(deviceId, actuatorKind);
  const changeMode = useDeviceModeChange(deviceId, actuatorKind);

  function selectMode(next: OperationMode) {
    void changeMode(mode, next, () => setMode(next));
  }

  const deviceLabel = actuatorKind === 'hbridge' ? 'motor' : 'relay';

  if (needsModeChoice) {
    return (
      <div className="space-y-2 rounded-lg border border-slate-700/80 bg-slate-950/40 p-3">
        <p className="text-sm text-slate-300">Choose how to operate this {deviceLabel} device.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={() => selectMode('manual')}>
            Manual
          </Button>
          <Button size="sm" onClick={() => selectMode('automatic')}>
            Automatic
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Mode</span>
      <div className="inline-flex rounded-lg border border-slate-700 p-0.5">
        {(['manual', 'automatic'] as OperationMode[]).map((option) => (
          <button
            key={option}
            type="button"
            className={[
              'rounded-md px-3 py-1 text-xs font-semibold capitalize transition-colors',
              mode === option
                ? 'bg-indigo-600 text-white'
                : 'text-slate-400 hover:bg-slate-800 hover:text-slate-200',
            ].join(' ')}
            onClick={() => selectMode(option)}
          >
            {option}
          </button>
        ))}
      </div>
    </div>
  );
}
