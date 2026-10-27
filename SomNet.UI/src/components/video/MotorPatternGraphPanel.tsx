import { useEffect, useMemo, useState } from 'react';
import { MOTOR_AUTOMATIC_RUN_MODE_OPTIONS } from '@/types/motorAutomaticModes';
import type { MotorAutomaticControlState, MotorManualControlState } from '@/types/motorModes';
import type { OperationMode } from '@/types/modes';
import {
  buildMotorAutomaticSpeedSchedule,
  buildMotorManualSpeedSchedule,
} from '@/utils/motorSpeedSchedule';
import { MotorSpeedPatternChart } from '@/components/video/MotorSpeedPatternChart';

interface MotorPatternGraphPanelProps {
  mode: OperationMode;
  motorAutomatic: MotorAutomaticControlState;
  motorManual: MotorManualControlState;
  sessionStartedAtIso: string | null;
  showNowMarker: boolean;
}

function modeLabel(automaticMode: MotorAutomaticControlState['automaticMode']): string {
  return (
    MOTOR_AUTOMATIC_RUN_MODE_OPTIONS.find((option) => option.value === automaticMode)?.label ??
    automaticMode
  );
}

export function MotorPatternGraphPanel({
  mode,
  motorAutomatic,
  motorManual,
  sessionStartedAtIso,
  showNowMarker,
}: MotorPatternGraphPanelProps) {
  const schedule = useMemo(() => {
    if (mode === 'automatic') {
      return buildMotorAutomaticSpeedSchedule(motorAutomatic);
    }
    return buildMotorManualSpeedSchedule(motorManual);
  }, [mode, motorAutomatic, motorManual]);

  const [nowSec, setNowSec] = useState<number | null>(null);

  useEffect(() => {
    if (!showNowMarker || !sessionStartedAtIso) {
      setNowSec(null);
      return;
    }

    const startedMs = Date.parse(sessionStartedAtIso);
    if (!Number.isFinite(startedMs)) {
      setNowSec(null);
      return;
    }

    const tick = () => {
      setNowSec(Math.max(0, (Date.now() - startedMs) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 300);
    return () => window.clearInterval(id);
  }, [sessionStartedAtIso, showNowMarker]);

  const title =
    mode === 'automatic'
      ? `Commanded speed — ${modeLabel(motorAutomatic.automaticMode)}`
      : 'Commanded speed — Manual';

  const previewHint =
    mode === 'automatic' && !motorAutomatic.running
      ? 'Planned schedule from current settings'
      : mode === 'automatic' && motorAutomatic.running
        ? 'Commanded targets (same plan as sent to the device)'
        : 'Current manual speed setting';

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3">
      <div>
        <p className="text-sm font-medium text-slate-200">{title}</p>
        <p className="text-xs text-slate-500">{previewHint}</p>
        {schedule.illustrativeRandom ? (
          <p className="mt-1 text-xs text-slate-500">
            Random segments show a stable example path; the device picks its own speeds at runtime.
          </p>
        ) : null}
      </div>
      <MotorSpeedPatternChart
        schedule={schedule}
        nowSec={showNowMarker ? nowSec : null}
        runningLabel={showNowMarker ? 'Now' : undefined}
      />
    </div>
  );
}
