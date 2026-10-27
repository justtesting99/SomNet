import type { AutomaticRunMode, BurstStyle, EndSessionMode } from '@/types/modes';

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
  automaticMode: AutomaticRunMode;
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
  burstPercent: 10,
  burstStyle: 'fixedPowerDelay',
  burstStrokePowerMin: 0,
  burstStrokePowerMax: 100,
  burstDelayMin: 1,
  burstDelayMax: 5,
  burstStrokesMin: 5,
  burstStrokesMax: 10,
};
