import type { MotorAutomaticRunMode } from '@/types/motorAutomaticModes';
import type { AppOptions } from '@/types/options';

/** Modes where segment interval is an intentional ramp (wave / build-up). */
export function motorModeUsesFullSegmentRamp(mode: MotorAutomaticRunMode): boolean {
  return mode === 'powerWave' || mode === 'buildUp';
}

/**
 * Wire value for motor automatic-start `segmentTargetRampMs`.
 * -1 = ramp over full segment interval (default / waveforms).
 * 0 = instant step to target, hold for segment interval.
 * >0 = ramp for that many ms, then hold for remainder of segment.
 * Burst micro-cycles use the same wire value (-1 → panel Ramp ms for burst step).
 */
export function resolveMotorSegmentTargetRampMs(
  mode: MotorAutomaticRunMode,
  options: Pick<AppOptions, 'motorSegmentTargetRampMode' | 'motorSegmentTargetRampMs'>,
): number {
  if (motorModeUsesFullSegmentRamp(mode)) {
    return -1;
  }

  switch (options.motorSegmentTargetRampMode) {
    case 'instant':
      return 0;
    case 'fixedMs':
      return Math.min(30_000, Math.max(0, Math.round(options.motorSegmentTargetRampMs)));
    case 'segmentDuration':
    default:
      return -1;
  }
}
