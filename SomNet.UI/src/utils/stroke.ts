export function computeStrokeMs(percent: number, minimumMs: number, maximumMs: number): number {
  const min = Math.min(minimumMs, maximumMs);
  const max = Math.max(minimumMs, maximumMs);
  return Math.round(min + (max - min) * (percent / 100));
}
