import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { MOTOR_AUTOMATIC_RUN_MODE_OPTIONS } from '@/types/motorAutomaticModes';
import type { MotorAutomaticControlState, MotorManualControlState } from '@/types/motorModes';
import type { OperationMode } from '@/types/modes';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import {
  buildMotorAutomaticSpeedSchedule,
  buildMotorManualSpeedSchedule,
  buildMotorSpeedScheduleFromLiveSegments,
  MOTOR_PATTERN_PREVIEW_NO_AUTO_END_SEC,
  speedAtScheduleTime,
} from '@/utils/motorSpeedSchedule';
import { readMotorPatternRunAnchor } from '@/utils/motorPatternRunAnchor';
import {
  getMotorAutomaticSegments,
  subscribeMotorAutomaticSegments,
} from '@/utils/motorAutomaticSegmentStore';
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

function automaticHorizonSec(state: MotorAutomaticControlState): number {
  return state.endSessionMode === 'minutes'
    ? Math.max(1, state.endSessionValue * 60)
    : MOTOR_PATTERN_PREVIEW_NO_AUTO_END_SEC;
}

export function MotorPatternGraphPanel({
  mode,
  motorAutomatic,
  motorManual,
  sessionStartedAtIso,
  showNowMarker,
}: MotorPatternGraphPanelProps) {
  const { selectedSub } = useSubTarget();
  const { selectedDeviceId } = useSubDevice();

  const liveSegments = useSyncExternalStore(
    subscribeMotorAutomaticSegments,
    () => getMotorAutomaticSegments(selectedDeviceId ?? ''),
    () => [],
  );

  const schedule = useMemo(() => {
    if (mode === 'automatic') {
      const horizonSec = automaticHorizonSec(motorAutomatic);
      if (motorAutomatic.running && liveSegments.length > 0) {
        return buildMotorSpeedScheduleFromLiveSegments(liveSegments, horizonSec);
      }
      return buildMotorAutomaticSpeedSchedule(motorAutomatic);
    }
    return buildMotorManualSpeedSchedule(motorManual);
  }, [liveSegments, mode, motorAutomatic, motorManual]);

  const usingLiveSegments =
    mode === 'automatic' && motorAutomatic.running && liveSegments.length > 0;

  const [nowSec, setNowSec] = useState<number | null>(null);

  useEffect(() => {
    if (!showNowMarker) {
      setNowSec(null);
      return;
    }

    let startedMs: number | null = null;
    if (mode === 'automatic' && motorAutomatic.running && selectedDeviceId) {
      startedMs = readMotorPatternRunAnchor(selectedSub, selectedDeviceId);
    }
    if (startedMs == null && sessionStartedAtIso) {
      const parsed = Date.parse(sessionStartedAtIso);
      if (Number.isFinite(parsed)) {
        startedMs = parsed;
      }
    }
    if (startedMs == null) {
      setNowSec(null);
      return;
    }

    const tick = () => {
      setNowSec(Math.max(0, (Date.now() - startedMs!) / 1000));
    };
    tick();
    const id = window.setInterval(tick, 300);
    return () => window.clearInterval(id);
  }, [
    mode,
    motorAutomatic.running,
    selectedDeviceId,
    selectedSub,
    sessionStartedAtIso,
    showNowMarker,
  ]);

  const nowSpeedPercent =
    nowSec != null && showNowMarker ? speedAtScheduleTime(schedule, nowSec) : null;

  const title =
    mode === 'automatic'
      ? `Commanded speed — ${modeLabel(motorAutomatic.automaticMode)}`
      : 'Commanded speed — Manual';

  const previewHint =
    mode === 'automatic' && !motorAutomatic.running
      ? 'Planned schedule from current settings'
      : mode === 'automatic' && usingLiveSegments
        ? 'Live graph from device-reported segment targets'
        : mode === 'automatic' && motorAutomatic.running
          ? 'Waiting for segment data from the device…'
          : 'Current manual speed setting';

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3">
      <div>
        <p className="text-sm font-medium text-slate-200">{title}</p>
        <p className="text-xs text-slate-500">{previewHint}</p>
        {schedule.illustrativeRandom && !usingLiveSegments ? (
          <p className="mt-1 text-xs text-slate-500">
            Before Start, random modes show a fixed example path. After Start, the graph uses
            speeds the device actually chose.
          </p>
        ) : null}
      </div>
      <MotorSpeedPatternChart
        deviceId={selectedDeviceId ?? undefined}
        schedule={schedule}
        nowSec={showNowMarker ? nowSec : null}
        nowSpeedPercent={nowSpeedPercent}
        runningLabel={showNowMarker ? 'Now' : undefined}
      />
    </div>
  );
}
