export type ManualSessionEndReason = 'abort' | 'mode-switch' | 'sign-out' | 'sub-change';

export interface ManualSessionStats {
  strokeCount: number;
  burstCount: number;
  burstStrokes: number;
  burstDelaySeconds: number;
  abortCount: number;
}

export function buildManualSessionSummary(stats: ManualSessionStats): string {
  const parts: string[] = [`${stats.strokeCount} manual stroke${stats.strokeCount === 1 ? '' : 's'}`];

  if (stats.burstCount > 0) {
    parts.push(
      `${stats.burstCount} burst${stats.burstCount === 1 ? '' : 's'} (${stats.burstStrokes} strokes @ ${stats.burstDelaySeconds}s delay)`,
    );
  } else if (stats.strokeCount > 0) {
    parts.push('no bursts');
  }

  if (stats.abortCount > 0) {
    parts.push(`${stats.abortCount} abort`);
  }

  return `${parts.join(', ')}.`;
}

export function buildAutomaticSessionSummary(
  startedAt: string,
  endReason: string,
): string {
  const elapsedMinutes = Math.max(
    1,
    Math.round((Date.now() - Date.parse(startedAt)) / 60_000),
  );

  return `Automatic session ran ${elapsedMinutes} minute${elapsedMinutes === 1 ? '' : 's'}, ${endReason}.`;
}
