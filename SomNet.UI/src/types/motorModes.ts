import type { BurstPlacement, BurstStyle, EndSessionMode } from '@/types/modes';
import type { MotorAutomaticRunMode } from '@/types/motorAutomaticModes';

/** Same wire values as relay `BURST_STYLE_OPTIONS`; labels use speed (motor UI). */
export const MOTOR_BURST_STYLE_OPTIONS: { value: BurstStyle; label: string }[] = [
  { value: 'fixedPowerDelay', label: 'Fixed Speed/Delay' },
  { value: 'randomPowerOnly', label: 'Random Speed Only' },
  { value: 'randomDelayOnly', label: 'Random Delay Only' },
  { value: 'randomPowerAndDelay', label: 'Random Speed/Delay' },
];

export interface MotorManualControlState {
  minimumDutyPercent: number;
  maximumDutyPercent: number;
  speedPercent: number;
}

export const defaultMotorManualState: MotorManualControlState = {
  minimumDutyPercent: 20,
  maximumDutyPercent: 80,
  speedPercent: 0,
};

export interface MotorAutomaticControlState {
  running: boolean;
  automaticMode: MotorAutomaticRunMode;
  minimumDutyPercent: number;
  maximumDutyPercent: number;
  minimumSpeedPercent: number;
  maximumSpeedPercent: number;
  segmentMinSeconds: number;
  segmentMaxSeconds: number;
  delayBeforeStartSeconds: number;
  rampMs: number;
  endSessionMode: EndSessionMode;
  endSessionValue: number;
  burstsOn: boolean;
  burstPlacement: BurstPlacement;
  burstPercent: number;
  burstStyle: BurstStyle;
  burstStrokePowerMin: number;
  burstStrokePowerMax: number;
  burstDelayMin: number;
  burstDelayMax: number;
  burstStrokesMin: number;
  burstStrokesMax: number;
}

export const defaultMotorAutomaticState: MotorAutomaticControlState = {
  running: false,
  automaticMode: 'periodic',
  minimumDutyPercent: 20,
  maximumDutyPercent: 80,
  minimumSpeedPercent: 0,
  maximumSpeedPercent: 100,
  segmentMinSeconds: 5,
  segmentMaxSeconds: 20,
  delayBeforeStartSeconds: 0,
  rampMs: 500,
  endSessionMode: 'minutes',
  endSessionValue: 30,
  burstsOn: false,
  burstPlacement: 'mainPlusSessionSpread',
  burstPercent: 10,
  burstStyle: 'fixedPowerDelay',
  burstStrokePowerMin: 0,
  burstStrokePowerMax: 100,
  burstDelayMin: 1,
  burstDelayMax: 5,
  burstStrokesMin: 5,
  burstStrokesMax: 10,
};
