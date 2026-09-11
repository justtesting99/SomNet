import type { ManualActionEvent } from '@/utils/sessionSummary';

export interface ParsedManualInProgress {
  events: ManualActionEvent[];
  abortCount: number;
}

const STROKE_SEGMENT =
  /^(\d+) strokes? at (\d+)%(?: \((\d+) ms\))?$/i;
const BURST_SEGMENT =
  /^(\d+) bursts? at (\d+)% \((\d+) strokes @ (\d+)s delay\)$/i;
const ABORT_SUFFIX = /,\s*(\d+)\s+aborts?\s*$/i;
const ABORT_ONLY = /^(\d+)\s+aborts?\s*$/i;

/** Parse server PATCH summary back into manual session state (lossy for grouped strokes). */
export function parseManualInProgressSummary(summary: string): ParsedManualInProgress {
  let body = summary.trim().replace(/\.\s*$/, '');
  if (body.length === 0) {
    return { events: [], abortCount: 0 };
  }

  const lower = body.toLowerCase();
  if (lower === 'in progress') {
    return { events: [], abortCount: 0 };
  }

  if (lower.startsWith('in progress:')) {
    body = body.slice('in progress:'.length).trim();
  } else if (lower.startsWith('in progress,')) {
    body = body.slice('in progress,'.length).trim();
  }

  let abortCount = 0;
  const abortOnlyMatch = body.match(ABORT_ONLY);
  if (abortOnlyMatch) {
    return { events: [], abortCount: Number.parseInt(abortOnlyMatch[1], 10) };
  }

  const abortMatch = body.match(ABORT_SUFFIX);
  if (abortMatch) {
    abortCount = Number.parseInt(abortMatch[1], 10);
    body = body.slice(0, abortMatch.index).trim();
  }

  if (body.length === 0) {
    return { events: [], abortCount };
  }

  const events: ManualActionEvent[] = [];

  for (const segment of body.split(',').map((part) => part.trim()).filter(Boolean)) {
    const strokeMatch = segment.match(STROKE_SEGMENT);
    if (strokeMatch) {
      const count = Number.parseInt(strokeMatch[1], 10);
      const powerPercent = Number.parseInt(strokeMatch[2], 10);
      const actualStrokeMs = strokeMatch[3]
        ? Number.parseInt(strokeMatch[3], 10)
        : undefined;

      for (let index = 0; index < count; index += 1) {
        events.push({
          type: 'stroke',
          powerPercent,
          actualStrokeMs: count === 1 ? actualStrokeMs : undefined,
        });
      }
      continue;
    }

    const burstMatch = segment.match(BURST_SEGMENT);
    if (burstMatch) {
      const count = Number.parseInt(burstMatch[1], 10);
      const powerPercent = Number.parseInt(burstMatch[2], 10);
      const burstStrokes = Number.parseInt(burstMatch[3], 10);
      const burstDelaySeconds = Number.parseInt(burstMatch[4], 10);

      for (let index = 0; index < count; index += 1) {
        events.push({
          type: 'burst',
          powerPercent,
          burstStrokes,
          burstDelaySeconds,
        });
      }
    }
  }

  return { events, abortCount };
}
