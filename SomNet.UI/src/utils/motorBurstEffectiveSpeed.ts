import type { MotorAutomaticControlState } from '@/types/motorModes';
import { getBurstFieldRules } from '@/utils/burstFieldRules';

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.round(value)));
}

/** Motor bursts map relative power into min/max **duty** (PWM band), not speed band. */
export function resolveMotorBurstDutyPercent(
  burstRelativePower: number,
  state: MotorAutomaticControlState,
): number {
  const relative = clampInt(burstRelativePower, 0, 100);
  const lo = Math.min(state.minimumDutyPercent, state.maximumDutyPercent);
  const hi = Math.max(state.minimumDutyPercent, state.maximumDutyPercent);
  if (hi <= lo) {
    return hi;
  }
  return lo + Math.floor(((hi - lo) * relative) / 100);
}

/** Map duty to the same 0–100 axis used for main segment telemetry / graph. */
export function motorDutyPercentToGraphSpeedPercent(
  dutyPercent: number,
  state: MotorAutomaticControlState,
): number {
  const duty = clampInt(dutyPercent, 0, 100);
  const lo = Math.min(state.minimumDutyPercent, state.maximumDutyPercent);
  const hi = Math.max(state.minimumDutyPercent, state.maximumDutyPercent);
  if (hi <= lo) {
    return 100;
  }
  return clampInt(Math.floor(((duty - lo) * 100) / (hi - lo)), 0, 100);
}

/** Graph / telemetry speed for a burst relative power (MA-D28 duty envelope). */
export function resolveMotorBurstGraphSpeedPercent(
  burstRelativePower: number,
  state: MotorAutomaticControlState,
): number {
  return motorDutyPercentToGraphSpeedPercent(
    resolveMotorBurstDutyPercent(burstRelativePower, state),
    state,
  );
}

/** @deprecated alias — use resolveMotorBurstGraphSpeedPercent */
export function resolveMotorBurstEffectiveSpeedPercent(
  burstRelativePower: number,
  state: MotorAutomaticControlState,
): number {
  return resolveMotorBurstGraphSpeedPercent(burstRelativePower, state);
}

export function describeMotorBurstEffectiveSpeed(state: MotorAutomaticControlState): string {
  const dutyLo = Math.min(state.minimumDutyPercent, state.maximumDutyPercent);
  const dutyHi = Math.max(state.minimumDutyPercent, state.maximumDutyPercent);
  const rules = getBurstFieldRules(state.burstStyle);
  const relMax = state.burstStrokePowerMax;
  const relMin = rules.disableBurstStrokePowerMin ? relMax : state.burstStrokePowerMin;
  const dutyAtMin = resolveMotorBurstDutyPercent(relMin, state);
  const dutyAtMax = resolveMotorBurstDutyPercent(relMax, state);
  const graphAtMax = motorDutyPercentToGraphSpeedPercent(dutyAtMax, state);
  if (rules.disableBurstStrokePowerMin || relMin === relMax) {
    return (
      `Burst max ${relMax}% relative → duty ${dutyAtMax}% (band ${dutyLo}–${dutyHi}% PWM). ` +
      `Graph axis ≈ ${graphAtMax}% — can be above or below main segment speeds.`
    );
  }
  const graphAtMin = motorDutyPercentToGraphSpeedPercent(dutyAtMin, state);
  return (
    `Burst relative ${relMin}–${relMax}% → duty ${dutyAtMin}–${dutyAtMax}% (band ${dutyLo}–${dutyHi}%). ` +
    `Graph axis ≈ ${graphAtMin}–${graphAtMax}%.`
  );
}
