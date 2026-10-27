import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { AUTOMATIC_RUN_MODE_OPTIONS } from '@/types/modes';
import type { AutomaticControlState, ManualControlState } from '@/types/modes';
import type { OperationMode } from '@/types/modes';
import { useSubDevice } from '@/context/SubDeviceProvider';
import { useSubTarget } from '@/context/SubTargetProvider';
import {
  buildRelayAutomaticPowerSchedule,
  buildRelayManualPowerSchedule,
  buildRelayPowerScheduleFromLiveSegments,
  powerAtScheduleTime,
  RELAY_PATTERN_PREVIEW_NO_AUTO_END_SEC,
} from '@/utils/relayPowerSchedule';
import { readMotorPatternRunAnchor } from '@/utils/motorPatternRunAnchor';
import {
  getRelayAutomaticSegments,
  subscribeRelayAutomaticSegments,
} from '@/utils/relayAutomaticSegmentStore';
import { MotorSpeedPatternChart } from '@/components/video/MotorSpeedPatternChart';

interface RelayPatternGraphPanelProps {
  mode: OperationMode;
  automatic: AutomaticControlState;
  manual: ManualControlState;
  sessionStartedAtIso: string | null;
  showNowMarker: boolean;
}

function modeLabel(automaticMode: AutomaticControlState['automaticMode']): string {
  return (
    AUTOMATIC_RUN_MODE_OPTIONS.find((option) => option.value === automaticMode)?.label ??
    automaticMode
  );
}

function automaticHorizonSec(state: AutomaticControlState): number {
  if (state.endSessionMode === 'minutes') {
    return Math.max(1, state.endSessionValue * 60);
  }
  if (state.endSessionMode === 'strokes') {
    return Math.max(30, state.endSessionValue * 5);
  }
  return RELAY_PATTERN_PREVIEW_NO_AUTO_END_SEC;
}

export function RelayPatternGraphPanel({
  mode,
  automatic,
  manual,
  sessionStartedAtIso,
  showNowMarker,
}: RelayPatternGraphPanelProps) {
  const { selectedSub } = useSubTarget();
  const { selectedDeviceId } = useSubDevice();

  const liveSegments = useSyncExternalStore(
    subscribeRelayAutomaticSegments,
    () => getRelayAutomaticSegments(selectedDeviceId ?? ''),
    () => [],
  );

  const schedule = useMemo(() => {
    if (mode === 'automatic') {
      const horizonSec = automaticHorizonSec(automatic);
      if (automatic.running && liveSegments.length > 0) {
        return buildRelayPowerScheduleFromLiveSegments(liveSegments, horizonSec);
      }
      return buildRelayAutomaticPowerSchedule(automatic);
    }
    return buildRelayManualPowerSchedule(manual);
  }, [automatic, liveSegments, manual, mode]);

  const usingLiveSegments = mode === 'automatic' && automatic.running && liveSegments.length > 0;

  const [nowSec, setNowSec] = useState<number | null>(null);

  useEffect(() => {
    if (!showNowMarker) {
      setNowSec(null);
      return;
    }

    let startedMs: number | null = null;
    if (mode === 'automatic' && automatic.running && selectedDeviceId) {
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
    automatic.running,
    mode,
    selectedDeviceId,
    selectedSub,
    sessionStartedAtIso,
    showNowMarker,
  ]);

  const nowPowerPercent =
    nowSec != null && showNowMarker ? powerAtScheduleTime(schedule, nowSec) : null;

  const title =
    mode === 'automatic'
      ? `Commanded power — ${modeLabel(automatic.automaticMode)}`
      : 'Commanded power — Manual';

  const previewHint =
    mode === 'automatic' && !automatic.running
      ? 'Planned stroke/gap envelope from current settings'
      : mode === 'automatic' && usingLiveSegments
        ? 'Live graph from device-reported strokes and gaps'
        : mode === 'automatic' && automatic.running
          ? 'Waiting for segment data from the device…'
          : 'Current manual power setting';

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-slate-800 bg-slate-900/50 px-3 py-3">
      <div>
        <p className="text-sm font-medium text-slate-200">{title}</p>
        <p className="text-xs text-slate-500">{previewHint}</p>
        {schedule.illustrativeRandom && !usingLiveSegments ? (
          <p className="mt-1 text-xs text-slate-500">
            Before Start, random modes show a fixed example path. After Start, the graph uses
            strokes the device actually chose.
          </p>
        ) : null}
      </div>
      <MotorSpeedPatternChart
        deviceId={selectedDeviceId ?? undefined}
        schedule={schedule}
        nowSec={showNowMarker ? nowSec : null}
        nowSpeedPercent={nowPowerPercent}
        runningLabel={showNowMarker ? 'Now' : undefined}
        yAxisLabel="Power %"
      />
    </div>
  );
}
