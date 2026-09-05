export type OperationMode = 'manual' | 'automatic';

export type EndSessionMode = 'minutes' | 'strokes' | 'noAutoEnd';

export type BurstStyle = 'fixedPowerDelay';

export type AutomaticRunMode = 'randomPowerAndTiming';

export const AUTOMATIC_RUN_MODE_OPTIONS: { value: AutomaticRunMode; label: string }[] = [
  { value: 'randomPowerAndTiming', label: 'Random Power and Timing' },
];

export interface ManualControlState {
  minimumStrokeMs: number;
  maximumStrokeMs: number;
  powerPercent: number;
  burstStrokes: number;
  burstDelaySeconds: number;
}

export interface AutomaticControlState {
  running: boolean;
  automaticMode: AutomaticRunMode;
  minimumStrokeMs: number;
  maximumStrokeMs: number;
  minimumPower: number;
  maximumPower: number;
  strokeMinSeconds: number;
  strokeMaxSeconds: number;
  delayBeforeStartSeconds: number;
  endSessionValue: number;
  endSessionMode: EndSessionMode;
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

export const defaultManualState: ManualControlState = {
  minimumStrokeMs: 25,
  maximumStrokeMs: 400,
  powerPercent: 0,
  burstStrokes: 5,
  burstDelaySeconds: 5,
};

export const defaultAutomaticState: AutomaticControlState = {
  running: false,
  automaticMode: 'randomPowerAndTiming',
  minimumStrokeMs: 25,
  maximumStrokeMs: 400,
  minimumPower: 0,
  maximumPower: 100,
  strokeMinSeconds: 5,
  strokeMaxSeconds: 20,
  delayBeforeStartSeconds: 0,
  endSessionValue: 100,
  endSessionMode: 'noAutoEnd',
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
