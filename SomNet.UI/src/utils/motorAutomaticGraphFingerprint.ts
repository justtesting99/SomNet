import type { MotorAutomaticControlState } from '@/types/motorModes';
import type { AppOptions } from '@/types/options';

/** Settings that affect preview or live motor pattern graph shape. */
export function motorAutomaticGraphSettingsFingerprint(
  state: MotorAutomaticControlState,
  appOptions: Pick<AppOptions, 'motorSegmentTargetRampMode' | 'motorSegmentTargetRampMs'>,
): string {
  return [
    state.automaticMode,
    state.minimumDutyPercent,
    state.maximumDutyPercent,
    state.minimumSpeedPercent,
    state.maximumSpeedPercent,
    state.segmentMinSeconds,
    state.segmentMaxSeconds,
    state.delayBeforeStartSeconds,
    state.rampMs,
    state.endSessionMode,
    state.endSessionValue,
    state.burstsOn,
    state.burstPlacement,
    state.burstPercent,
    state.burstStyle,
    state.burstStrokePowerMin,
    state.burstStrokePowerMax,
    state.burstDelayMin,
    state.burstDelayMax,
    state.burstStrokesMin,
    state.burstStrokesMax,
    appOptions.motorSegmentTargetRampMode,
    appOptions.motorSegmentTargetRampMs,
  ].join('|');
}
