import type { AutomaticRunMode } from '@/types/modes';

export interface AutomaticModeInfo {
  summary: string;
  endSessionNote?: string;
}

export const AUTOMATIC_MODE_INFO: Record<AutomaticRunMode, AutomaticModeInfo> = {
  periodic: {
    summary:
      'Steady cadence at maximum power. Minimum power and minimum gap are ignored — the device uses your maximum settings only.',
  },
  randomPowerOnly: {
    summary:
      'Random power between your min and max on each stroke, with a fixed gap between strokes. Minimum gap is ignored.',
  },
  randomTimingOnly: {
    summary:
      'Maximum power on every stroke with a random gap between strokes. Minimum power is ignored.',
  },
  randomPowerAndTiming: {
    summary:
      'Both power and gap vary randomly within your min/max ranges on each stroke.',
  },
  powerWave: {
    summary:
      'Power follows a repeating wave between min and max while gap stays fixed at maximum interval.',
    endSessionNote:
      'Wave schedule is pre-calculated from your end session duration or stroke count. No AutoEnd is not available.',
  },
  powerAndTimingWave: {
    summary:
      'Power and gap follow inverse periodic waves — as power rises, gap shortens, and vice versa.',
    endSessionNote:
      'Wave schedule is pre-calculated from your end session duration or stroke count. No AutoEnd is not available.',
  },
  buildUp: {
    summary:
      'A single ramp from minimum to maximum power while gap shortens from maximum to minimum over the session.',
    endSessionNote:
      'Build-up schedule is pre-calculated from your end session duration or stroke count. No AutoEnd is not available.',
  },
};

export function getAutomaticModeInfo(mode: AutomaticRunMode): AutomaticModeInfo {
  return AUTOMATIC_MODE_INFO[mode];
}
