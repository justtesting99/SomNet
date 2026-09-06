export interface StrokeMsLimits {
  absoluteMinimum: number;
  absoluteMaximum: number;
}

export function resolveStrokeMsBounds(limits: StrokeMsLimits): StrokeMsLimits {
  const absoluteMinimum = Math.min(limits.absoluteMinimum, limits.absoluteMaximum);
  const absoluteMaximum = Math.max(limits.absoluteMinimum, limits.absoluteMaximum);
  return { absoluteMinimum, absoluteMaximum };
}

export function normalizeStrokeMsPair(
  minimumStrokeMs: number,
  maximumStrokeMs: number,
  limits: StrokeMsLimits,
): { minimumStrokeMs: number; maximumStrokeMs: number } {
  const { absoluteMinimum, absoluteMaximum } = resolveStrokeMsBounds(limits);

  let min = minimumStrokeMs > 0 ? minimumStrokeMs : absoluteMinimum;
  let max = maximumStrokeMs > 0 ? maximumStrokeMs : absoluteMaximum;

  min = Math.max(absoluteMinimum, Math.min(absoluteMaximum, Math.trunc(min)));
  max = Math.max(absoluteMinimum, Math.min(absoluteMaximum, Math.trunc(max)));

  if (min > max) {
    min = max;
  }

  return { minimumStrokeMs: min, maximumStrokeMs: max };
}

export function clampMinimumStrokeMs(
  value: number,
  currentMaximumStrokeMs: number,
  limits: StrokeMsLimits,
): { minimumStrokeMs: number; maximumStrokeMs: number } {
  const { absoluteMinimum, absoluteMaximum } = resolveStrokeMsBounds(limits);
  const nextMin = Math.max(
    absoluteMinimum,
    Math.min(absoluteMaximum, Math.trunc(Number(value) || absoluteMinimum)),
  );

  return {
    minimumStrokeMs: nextMin,
    maximumStrokeMs: Math.max(nextMin, Math.min(absoluteMaximum, currentMaximumStrokeMs)),
  };
}

export function clampMaximumStrokeMs(
  value: number,
  currentMinimumStrokeMs: number,
  limits: StrokeMsLimits,
): number {
  const { absoluteMinimum, absoluteMaximum } = resolveStrokeMsBounds(limits);
  const floor = Math.max(absoluteMinimum, currentMinimumStrokeMs);

  return Math.max(floor, Math.min(absoluteMaximum, Math.trunc(Number(value) || floor)));
}
