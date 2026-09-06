export type ManualSessionEndReason = 'abort' | 'mode-switch' | 'sign-out' | 'sub-change';

export type ManualActionEvent =
  | { type: 'stroke'; powerPercent: number; actualStrokeMs?: number }
  | {
      type: 'burst';
      powerPercent: number;
      burstStrokes: number;
      burstDelaySeconds: number;
    };

export interface ManualSessionStats {
  events: ManualActionEvent[];
  abortCount: number;
  inProgress?: boolean;
}

function formatManualBreakdown(events: ManualActionEvent[]): string {
  if (events.length === 0) {
    return '';
  }

  const strokeCounts = new Map<number, number>();
  const burstCounts = new Map<
    string,
    {
      count: number;
      powerPercent: number;
      burstStrokes: number;
      burstDelaySeconds: number;
    }
  >();

  for (const event of events) {
    if (event.type === 'stroke') {
      strokeCounts.set(event.powerPercent, (strokeCounts.get(event.powerPercent) ?? 0) + 1);
      continue;
    }

    const key = `${event.powerPercent}|${event.burstStrokes}|${event.burstDelaySeconds}`;
    const existing = burstCounts.get(key);

    if (existing) {
      existing.count += 1;
    } else {
      burstCounts.set(key, {
        count: 1,
        powerPercent: event.powerPercent,
        burstStrokes: event.burstStrokes,
        burstDelaySeconds: event.burstDelaySeconds,
      });
    }
  }

  const parts: string[] = [];

  [...strokeCounts.entries()]
    .sort(([left], [right]) => left - right)
    .forEach(([powerPercent, count]) => {
      const strokeEvents = events.filter(
        (event): event is Extract<ManualActionEvent, { type: 'stroke' }> =>
          event.type === 'stroke' && event.powerPercent === powerPercent,
      );
      const measuredMs = strokeEvents.find((event) => event.actualStrokeMs !== undefined)
        ?.actualStrokeMs;

      if (count === 1 && measuredMs !== undefined) {
        parts.push(`1 stroke at ${powerPercent}% (${measuredMs} ms)`);
      } else {
        parts.push(`${count} stroke${count === 1 ? '' : 's'} at ${powerPercent}%`);
      }
    });

  [...burstCounts.values()]
    .sort(
      (left, right) =>
        left.powerPercent - right.powerPercent ||
        left.burstStrokes - right.burstStrokes ||
        left.burstDelaySeconds - right.burstDelaySeconds,
    )
    .forEach((group) => {
      parts.push(
        `${group.count} burst${group.count === 1 ? '' : 's'} at ${group.powerPercent}% (${group.burstStrokes} strokes @ ${group.burstDelaySeconds}s delay)`,
      );
    });

  return parts.join(', ');
}

export function buildManualSessionSummary(stats: ManualSessionStats): string {
  const breakdown = formatManualBreakdown(stats.events);
  const parts: string[] = [];

  if (stats.inProgress) {
    parts.push(breakdown ? `In progress: ${breakdown}` : 'In progress');
  } else if (breakdown) {
    parts.push(breakdown);
  } else {
    parts.push('No strokes or bursts');
  }

  if (stats.abortCount > 0) {
    parts.push(`${stats.abortCount} abort${stats.abortCount === 1 ? '' : 's'}`);
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
