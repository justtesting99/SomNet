import type { AutomaticRunMode } from '@/types/modes';
import { AUTOMATIC_MODE_INFO, type AutomaticModeInfo } from '@/utils/automaticModeInfo';

function adaptSummaryForMotor(summary: string): string {
  return summary
    .replace(/\bstroke\b/gi, (match) => (match[0] === 'S' ? 'Segment' : 'segment'))
    .replace(/\bstrokes\b/gi, 'segments')
    .replace(/\bpower\b/gi, (match) => (match[0] === 'P' ? 'Speed' : 'speed'))
    .replace(/\bgap\b/gi, 'segment length');
}

export function getMotorAutomaticModeInfo(mode: AutomaticRunMode): AutomaticModeInfo {
  const base = AUTOMATIC_MODE_INFO[mode];
  return {
    summary: adaptSummaryForMotor(base.summary),
    endSessionNote: base.endSessionNote
      ? adaptSummaryForMotor(base.endSessionNote)
      : undefined,
  };
}
