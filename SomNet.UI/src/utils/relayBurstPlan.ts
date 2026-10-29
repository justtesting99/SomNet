import type { AutomaticControlState, BurstStyle } from '@/types/modes';
import {
  burstMainTiming,
  burstPlacementSchedule,
  resolveBurstPlacement,
} from '@/utils/burstPlacement';
import { createSeededRandom } from '@/utils/motorSpeedSchedule';

export type BurstScheduleKind =
  | 'none'
  | 'strokeMilestones'
  | 'wallClock'
  | 'cadenceStride'
  | 'chancePerMainStroke';

export interface RelayBurstPlan {
  active: boolean;
  burstInsteadOfMain: boolean;
  kind: BurstScheduleKind;
  burstEventCount: number;
  nextMilestoneIndex: number;
  milestones: number[];
  cadenceStride: number;
  nextCadenceTriggerStroke: number;
}

const MAX_BURST_EVENTS = 100;

function roundPercentOfEnvelope(envelope: number, burstPercent: number): number {
  if (envelope <= 0 || burstPercent <= 0) {
    return 0;
  }
  return Math.floor((envelope * burstPercent + 50) / 100);
}

function burstCadenceStride(burstPercent: number): number {
  if (burstPercent <= 0) {
    return 0;
  }
  return Math.floor((100 + burstPercent / 2) / burstPercent);
}

function buildStrokeMilestonePlan(
  endSessionValue: number,
  burstPercent: number,
): RelayBurstPlan | null {
  const burstEventCount = roundPercentOfEnvelope(endSessionValue, burstPercent);
  if (burstEventCount <= 0) {
    return null;
  }
  const cappedCount = Math.min(MAX_BURST_EVENTS, burstEventCount);
  const milestones: number[] = [];
  for (let k = 1; k <= cappedCount; k += 1) {
    let milestone = Math.floor((k * endSessionValue) / cappedCount);
    if (milestone <= 0) {
      milestone = 1;
    }
    milestones.push(milestone);
  }
  return {
    active: true,
    burstInsteadOfMain: false,
    kind: 'strokeMilestones',
    burstEventCount: cappedCount,
    nextMilestoneIndex: 0,
    milestones,
    cadenceStride: 0,
    nextCadenceTriggerStroke: 0,
  };
}

function buildWallClockPlan(endSessionMinutes: number, burstPercent: number): RelayBurstPlan | null {
  const burstEventCount = roundPercentOfEnvelope(endSessionMinutes, burstPercent);
  if (burstEventCount <= 0) {
    return null;
  }
  const cappedCount = Math.min(MAX_BURST_EVENTS, burstEventCount);
  const sessionBudgetMs = endSessionMinutes * 60 * 1000;
  const milestones: number[] = [];
  for (let k = 1; k <= cappedCount; k += 1) {
    milestones.push(Math.floor((k * sessionBudgetMs) / cappedCount));
  }
  return {
    active: true,
    burstInsteadOfMain: false,
    kind: 'wallClock',
    burstEventCount: cappedCount,
    nextMilestoneIndex: 0,
    milestones,
    cadenceStride: 0,
    nextCadenceTriggerStroke: 0,
  };
}

function buildCadenceStridePlan(burstPercent: number): RelayBurstPlan | null {
  const stride = burstCadenceStride(burstPercent);
  if (stride <= 0) {
    return null;
  }
  return {
    active: true,
    burstInsteadOfMain: false,
    kind: 'cadenceStride',
    burstEventCount: 0,
    nextMilestoneIndex: 0,
    milestones: [],
    cadenceStride: stride,
    nextCadenceTriggerStroke: stride,
  };
}

const emptyPlan = (): RelayBurstPlan => ({
  active: false,
  burstInsteadOfMain: false,
  kind: 'none',
  burstEventCount: 0,
  nextMilestoneIndex: 0,
  milestones: [],
  cadenceStride: 0,
  nextCadenceTriggerStroke: 0,
});

export function buildRelayBurstPlan(state: AutomaticControlState): RelayBurstPlan {
  if (!state.burstsOn || state.burstPercent <= 0) {
    return emptyPlan();
  }

  const placement = resolveBurstPlacement(state);
  const insteadOfMain = burstMainTiming(placement) === 'insteadOf';
  const schedule = burstPlacementSchedule(placement);

  if (schedule === 'chanceAfterMainStroke') {
    return {
      active: true,
      burstInsteadOfMain: insteadOfMain,
      kind: 'chancePerMainStroke',
      burstEventCount: 0,
      nextMilestoneIndex: 0,
      milestones: [],
      cadenceStride: 0,
      nextCadenceTriggerStroke: 0,
    };
  }

  if (schedule === 'afterMainStroke') {
    if (state.endSessionMode === 'strokes' && state.endSessionValue > 0) {
      const plan =
        buildStrokeMilestonePlan(state.endSessionValue, state.burstPercent) ?? emptyPlan();
      return { ...plan, burstInsteadOfMain: insteadOfMain };
    }
    if (state.endSessionMode === 'minutes' && state.endSessionValue > 0) {
      const plan = buildCadenceStridePlan(state.burstPercent) ?? emptyPlan();
      return { ...plan, burstInsteadOfMain: insteadOfMain };
    }
    if (state.endSessionMode === 'noAutoEnd') {
      const plan = buildCadenceStridePlan(state.burstPercent) ?? emptyPlan();
      return { ...plan, burstInsteadOfMain: insteadOfMain };
    }
    return emptyPlan();
  }

  if (state.endSessionMode === 'strokes' && state.endSessionValue > 0) {
    const plan = buildStrokeMilestonePlan(state.endSessionValue, state.burstPercent) ?? emptyPlan();
    return { ...plan, burstInsteadOfMain: insteadOfMain };
  }
  if (state.endSessionMode === 'minutes' && state.endSessionValue > 0) {
    const plan = buildWallClockPlan(state.endSessionValue, state.burstPercent) ?? emptyPlan();
    return { ...plan, burstInsteadOfMain: insteadOfMain };
  }
  if (state.endSessionMode === 'noAutoEnd') {
    const plan = buildCadenceStridePlan(state.burstPercent) ?? emptyPlan();
    return { ...plan, burstInsteadOfMain: insteadOfMain };
  }

  return emptyPlan();
}

export function previewChanceBurstAfterStroke(
  state: AutomaticControlState,
  mainStrokeIndex: number,
  scheduleSeed: number,
): boolean {
  if (state.burstPercent >= 100) {
    return true;
  }
  if (state.burstPercent <= 0) {
    return false;
  }
  const rand = createSeededRandom((scheduleSeed + mainStrokeIndex * 9973) >>> 0);
  return Math.floor(rand() * 100) < state.burstPercent;
}

export function shouldTriggerBurstAfterMainStroke(
  plan: RelayBurstPlan,
  mainStrokesCompleted: number,
): boolean {
  if (!plan.active || plan.burstInsteadOfMain) {
    return false;
  }

  if (plan.kind === 'strokeMilestones') {
    if (plan.nextMilestoneIndex >= plan.burstEventCount) {
      return false;
    }
    return mainStrokesCompleted >= plan.milestones[plan.nextMilestoneIndex]!;
  }

  if (plan.kind === 'cadenceStride') {
    return (
      plan.nextCadenceTriggerStroke > 0 &&
      mainStrokesCompleted >= plan.nextCadenceTriggerStroke
    );
  }

  return false;
}

export function shouldTriggerBurstBeforeMainStroke(
  plan: RelayBurstPlan,
  mainStrokesCompleted: number,
): boolean {
  if (!plan.active || !plan.burstInsteadOfMain) {
    return false;
  }

  const upcomingMainStroke = mainStrokesCompleted + 1;

  if (plan.kind === 'strokeMilestones') {
    if (plan.nextMilestoneIndex >= plan.burstEventCount) {
      return false;
    }
    return upcomingMainStroke >= plan.milestones[plan.nextMilestoneIndex]!;
  }

  if (plan.kind === 'cadenceStride') {
    return (
      plan.nextCadenceTriggerStroke > 0 &&
      upcomingMainStroke >= plan.nextCadenceTriggerStroke
    );
  }

  return false;
}

export function shouldPreviewBurstAfterMainStroke(
  state: AutomaticControlState,
  plan: RelayBurstPlan,
  mainStrokesCompleted: number,
  scheduleSeed: number,
): boolean {
  if (!plan.active) {
    return false;
  }
  if (plan.kind === 'chancePerMainStroke') {
    return previewChanceBurstAfterStroke(state, mainStrokesCompleted, scheduleSeed);
  }
  return shouldTriggerBurstAfterMainStroke(plan, mainStrokesCompleted);
}

export function shouldPreviewBurstBeforeMainStroke(
  state: AutomaticControlState,
  plan: RelayBurstPlan,
  mainStrokesCompleted: number,
  scheduleSeed: number,
): boolean {
  if (!plan.active || !plan.burstInsteadOfMain) {
    return false;
  }
  if (plan.kind === 'chancePerMainStroke') {
    return previewChanceBurstAfterStroke(state, mainStrokesCompleted + 1, scheduleSeed);
  }
  return shouldTriggerBurstBeforeMainStroke(plan, mainStrokesCompleted);
}

export function shouldTriggerBurstInWaitingGap(
  plan: RelayBurstPlan,
  sessionElapsedMs: number,
): boolean {
  if (!plan.active || plan.kind !== 'wallClock') {
    return false;
  }
  if (plan.nextMilestoneIndex >= plan.burstEventCount) {
    return false;
  }
  return sessionElapsedMs >= plan.milestones[plan.nextMilestoneIndex]!;
}

export function advanceBurstPlan(plan: RelayBurstPlan): void {
  if (!plan.active) {
    return;
  }

  if (plan.kind === 'strokeMilestones' || plan.kind === 'wallClock') {
    if (plan.nextMilestoneIndex < plan.burstEventCount) {
      plan.nextMilestoneIndex += 1;
    }
    return;
  }

  if (plan.kind === 'cadenceStride' && plan.cadenceStride > 0) {
    plan.nextCadenceTriggerStroke += plan.cadenceStride;
  }
}

export function resolveBurstEffectivePower(
  burstRelativePower: number,
  state: AutomaticControlState,
): number {
  const relative = Math.min(100, Math.max(0, Math.round(burstRelativePower)));
  const minPower = Math.min(state.minimumPower, state.maximumPower);
  const maxPower = Math.max(state.minimumPower, state.maximumPower);
  return minPower + Math.floor(((maxPower - minPower) * relative) / 100);
}

function burstSeed(
  scheduleSeed: number,
  eventIndex: number,
  channel: number,
): () => number {
  return createSeededRandom((scheduleSeed + eventIndex * 7919 + channel * 0x9e3779b9) >>> 0);
}

export function previewBurstStrokeCount(
  state: AutomaticControlState,
  eventIndex: number,
  scheduleSeed: number,
): number {
  const rand = burstSeed(scheduleSeed, eventIndex, 1);
  const lo = Math.min(state.burstStrokesMin, state.burstStrokesMax);
  const hi = Math.max(state.burstStrokesMin, state.burstStrokesMax);
  return lo + Math.floor(rand() * (hi - lo + 1));
}

export function previewBurstRelativePower(
  state: AutomaticControlState,
  eventIndex: number,
  strokeInBurst: number,
  scheduleSeed: number,
): number {
  const style: BurstStyle = state.burstStyle;
  const rand = burstSeed(scheduleSeed, eventIndex, 10 + strokeInBurst);

  switch (style) {
    case 'randomPowerOnly':
    case 'randomPowerAndDelay': {
      const lo = Math.min(state.burstStrokePowerMin, state.burstStrokePowerMax);
      const hi = Math.max(state.burstStrokePowerMin, state.burstStrokePowerMax);
      return lo + Math.floor(rand() * (hi - lo + 1));
    }
    case 'fixedPowerDelay':
    case 'randomDelayOnly':
    default:
      return state.burstStrokePowerMax;
  }
}

export function previewBurstDelaySec(
  state: AutomaticControlState,
  eventIndex: number,
  strokeInBurst: number,
  scheduleSeed: number,
): number {
  const style: BurstStyle = state.burstStyle;
  const rand = burstSeed(scheduleSeed, eventIndex, 20 + strokeInBurst);

  switch (style) {
    case 'randomDelayOnly':
    case 'randomPowerAndDelay':
      return (
        state.burstDelayMin +
        Math.floor(rand() * (state.burstDelayMax - state.burstDelayMin + 1))
      );
    case 'fixedPowerDelay':
    case 'randomPowerOnly':
    default:
      return state.burstDelayMax;
  }
}

export function describeRelayBurstScheduleHint(state: AutomaticControlState): string | null {
  if (!state.burstsOn) {
    return null;
  }

  if (state.burstPercent <= 0) {
    return 'Burst percent is 0 — the device will not schedule burst events until percent is above 0.';
  }

  const placement = resolveBurstPlacement(state);
  const schedule = burstPlacementSchedule(placement);
  const insteadOf = burstMainTiming(placement) === 'insteadOf';
  const timingNote = insteadOf
    ? 'Burst runs instead of the scheduled main stroke (no main pulse on that beat).'
    : 'Main stroke completes, then burst cluster runs.';

  if (schedule === 'chanceAfterMainStroke') {
    const when = insteadOf ? 'before that main stroke' : 'after it';
    return `${timingNote} Each main opportunity has a ${state.burstPercent}% chance of a burst cluster ${when}. Count varies each run.`;
  }

  const plan = buildRelayBurstPlan(state);
  if (!plan.active) {
    if (schedule === 'sessionSpread') {
      const envelope =
        state.endSessionMode === 'minutes' || state.endSessionMode === 'strokes'
          ? state.endSessionValue
          : 0;
      if (envelope > 0) {
        const minPercentForOneEvent = Math.min(100, Math.ceil(50 / envelope));
        const unit = state.endSessionMode === 'minutes' ? 'min' : 'strokes';
        return `Burst percent ${state.burstPercent}% on a ${envelope}-${unit} session rounds to 0 burst events (spread mode). Use at least ${minPercentForOneEvent}%, or switch placement to after main strokes / chance.`;
      }
    }
    return 'No burst schedule with current end-session settings.';
  }

  if (plan.kind === 'cadenceStride') {
    const cadenceNote =
      schedule === 'afterMainStroke' && state.endSessionMode === 'minutes'
        ? ' (stroke-linked during timed session)'
        : '';
    const beat = insteadOf ? 'instead of main stroke' : 'after main stroke';
    return `${timingNote} First burst ${beat} ${plan.nextCadenceTriggerStroke}, then every ${plan.cadenceStride} main opportunities${cadenceNote}.`;
  }

  if (plan.kind === 'strokeMilestones' && plan.milestones.length > 0) {
    const beat = insteadOf ? 'instead of main stroke' : 'after main stroke';
    return `${timingNote} About ${plan.burstEventCount} burst event(s) — first ${beat} ${plan.milestones[0]}.`;
  }

  if (plan.kind === 'wallClock' && plan.milestones.length > 0) {
    const firstMin = Math.max(1, Math.round(plan.milestones[0]! / 60_000));
    return `${timingNote} About ${plan.burstEventCount} burst event(s) spread across ${state.endSessionValue} min — first near minute ${firstMin} (between main strokes).`;
  }

  return null;
}

export function burstPreviewLikelyMatchesMainPower(state: AutomaticControlState): boolean {
  if (!state.burstsOn) {
    return false;
  }
  if (state.burstStyle === 'randomPowerOnly' || state.burstStyle === 'randomPowerAndDelay') {
    return false;
  }
  return state.burstStrokePowerMax >= 95;
}
