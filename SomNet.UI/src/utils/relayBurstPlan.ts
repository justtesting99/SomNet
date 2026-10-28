import type { AutomaticControlState, BurstStyle } from '@/types/modes';
import { createSeededRandom } from '@/utils/motorSpeedSchedule';

export type BurstScheduleKind = 'none' | 'strokeMilestones' | 'wallClock' | 'cadenceStride';

export interface RelayBurstPlan {
  active: boolean;
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

export function buildRelayBurstPlan(state: AutomaticControlState): RelayBurstPlan {
  const empty: RelayBurstPlan = {
    active: false,
    kind: 'none',
    burstEventCount: 0,
    nextMilestoneIndex: 0,
    milestones: [],
    cadenceStride: 0,
    nextCadenceTriggerStroke: 0,
  };

  if (!state.burstsOn || state.burstPercent <= 0) {
    return empty;
  }

  if (state.endSessionMode === 'strokes' && state.endSessionValue > 0) {
    const burstEventCount = roundPercentOfEnvelope(state.endSessionValue, state.burstPercent);
    if (burstEventCount <= 0) {
      return empty;
    }
    const cappedCount = Math.min(MAX_BURST_EVENTS, burstEventCount);
    const milestones: number[] = [];
    for (let k = 1; k <= cappedCount; k += 1) {
      let milestone = Math.floor((k * state.endSessionValue) / cappedCount);
      if (milestone <= 0) {
        milestone = 1;
      }
      milestones.push(milestone);
    }
    return {
      active: true,
      kind: 'strokeMilestones',
      burstEventCount: cappedCount,
      nextMilestoneIndex: 0,
      milestones,
      cadenceStride: 0,
      nextCadenceTriggerStroke: 0,
    };
  }

  if (state.endSessionMode === 'minutes' && state.endSessionValue > 0) {
    const burstEventCount = roundPercentOfEnvelope(state.endSessionValue, state.burstPercent);
    if (burstEventCount <= 0) {
      return empty;
    }
    const cappedCount = Math.min(MAX_BURST_EVENTS, burstEventCount);
    const sessionBudgetMs = state.endSessionValue * 60 * 1000;
    const milestones: number[] = [];
    for (let k = 1; k <= cappedCount; k += 1) {
      milestones.push(Math.floor((k * sessionBudgetMs) / cappedCount));
    }
    return {
      active: true,
      kind: 'wallClock',
      burstEventCount: cappedCount,
      nextMilestoneIndex: 0,
      milestones,
      cadenceStride: 0,
      nextCadenceTriggerStroke: 0,
    };
  }

  if (state.endSessionMode === 'noAutoEnd') {
    const stride = burstCadenceStride(state.burstPercent);
    if (stride <= 0) {
      return empty;
    }
    return {
      active: true,
      kind: 'cadenceStride',
      burstEventCount: 0,
      nextMilestoneIndex: 0,
      milestones: [],
      cadenceStride: stride,
      nextCadenceTriggerStroke: stride,
    };
  }

  return empty;
}

export function shouldTriggerBurstAfterMainStroke(
  plan: RelayBurstPlan,
  mainStrokesCompleted: number,
): boolean {
  if (!plan.active) {
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

/** Operator hint: when the device will schedule the first burst (matches firmware). */
export function describeRelayBurstScheduleHint(state: AutomaticControlState): string | null {
  if (!state.burstsOn) {
    return null;
  }

  if (state.burstPercent <= 0) {
    return 'Burst percent is 0 — the device will not schedule burst events until percent is above 0.';
  }

  const plan = buildRelayBurstPlan(state);
  if (!plan.active) {
    const envelope =
      state.endSessionMode === 'minutes' || state.endSessionMode === 'strokes'
        ? state.endSessionValue
        : 0;
    if (envelope > 0) {
      const minPercentForOneEvent = Math.min(100, Math.ceil(50 / envelope));
      const unit = state.endSessionMode === 'minutes' ? 'min' : 'strokes';
      return `Burst percent ${state.burstPercent}% on a ${envelope}-${unit} session rounds to 0 burst events on the device. Use at least ${minPercentForOneEvent}% for this length, or increase end session (e.g. 2 min at 25% → 1 burst).`;
    }
    return 'No burst schedule with current end-session settings. Use a positive end value (minutes or strokes), or raise burst percent.';
  }

  if (plan.kind === 'cadenceStride') {
    return `First burst after ${plan.nextCadenceTriggerStroke} main strokes, then about every ${plan.cadenceStride} main strokes (no auto end).`;
  }

  if (plan.kind === 'strokeMilestones' && plan.milestones.length > 0) {
    return `About ${plan.burstEventCount} burst event(s) across the session — first after main stroke ${plan.milestones[0]}.`;
  }

  if (plan.kind === 'wallClock' && plan.milestones.length > 0) {
    const firstMin = Math.max(1, Math.round(plan.milestones[0]! / 60_000));
    return `About ${plan.burstEventCount} burst event(s) spread across ${state.endSessionValue} min — first near minute ${firstMin} (during gaps between main strokes).`;
  }

  return null;
}

/** True when fixed burst style uses relative max at session ceiling (often matches main max). */
export function burstPreviewLikelyMatchesMainPower(state: AutomaticControlState): boolean {
  if (!state.burstsOn) {
    return false;
  }
  if (state.burstStyle === 'randomPowerOnly' || state.burstStyle === 'randomPowerAndDelay') {
    return false;
  }
  return state.burstStrokePowerMax >= 95;
}
