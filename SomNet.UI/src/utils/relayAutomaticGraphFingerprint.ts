import type { AutomaticControlState } from '@/types/modes';

/** Settings that affect preview or live relay pattern graph shape. */
export function relayAutomaticGraphSettingsFingerprint(state: AutomaticControlState): string {
  return [
    state.automaticMode,
    state.minimumStrokeMs,
    state.maximumStrokeMs,
    state.minimumPower,
    state.maximumPower,
    state.strokeMinSeconds,
    state.strokeMaxSeconds,
    state.delayBeforeStartSeconds,
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
  ].join('|');
}
