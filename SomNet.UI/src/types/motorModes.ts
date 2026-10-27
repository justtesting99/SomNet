import type { EndSessionMode } from '@/types/modes';

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
  automaticMode: 'periodic';
  minimumDutyPercent: number;
  maximumDutyPercent: number;
  segmentMinSeconds: number;
  segmentMaxSeconds: number;
  delayBeforeStartSeconds: number;
  rampMs: number;
  endSessionMode: EndSessionMode;
  endSessionValue: number;
}

export const defaultMotorAutomaticState: MotorAutomaticControlState = {
  running: false,
  automaticMode: 'periodic',
  minimumDutyPercent: 20,
  maximumDutyPercent: 80,
  segmentMinSeconds: 5,
  segmentMaxSeconds: 20,
  delayBeforeStartSeconds: 0,
  rampMs: 500,
  endSessionMode: 'minutes',
  endSessionValue: 30,
};
