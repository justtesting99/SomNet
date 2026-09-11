import { describe, expect, it } from 'vitest';
import { buildManualSessionSummary } from '@/utils/sessionSummary';
import { parseManualInProgressSummary } from '@/utils/manualSessionRehydrate';

describe('parseManualInProgressSummary', () => {
  it('parses empty in progress', () => {
    expect(parseManualInProgressSummary('In progress.')).toEqual({
      events: [],
      abortCount: 0,
    });
  });

  it('round-trips grouped strokes and burst', () => {
    const summary = buildManualSessionSummary({
      events: [
        { type: 'stroke', powerPercent: 60 },
        { type: 'stroke', powerPercent: 60 },
        {
          type: 'burst',
          powerPercent: 75,
          burstStrokes: 5,
          burstDelaySeconds: 5,
        },
      ],
      abortCount: 1,
      inProgress: true,
    });

    expect(parseManualInProgressSummary(summary)).toEqual({
      events: [
        { type: 'stroke', powerPercent: 60 },
        { type: 'stroke', powerPercent: 60 },
        {
          type: 'burst',
          powerPercent: 75,
          burstStrokes: 5,
          burstDelaySeconds: 5,
        },
      ],
      abortCount: 1,
    });
  });

  it('preserves single-stroke measured ms', () => {
    const summary = buildManualSessionSummary({
      events: [{ type: 'stroke', powerPercent: 45, actualStrokeMs: 1399 }],
      abortCount: 0,
      inProgress: true,
    });

    expect(parseManualInProgressSummary(summary)).toEqual({
      events: [{ type: 'stroke', powerPercent: 45, actualStrokeMs: 1399 }],
      abortCount: 0,
    });
  });

  it('parses in progress with aborts only', () => {
    const summary = buildManualSessionSummary({
      events: [],
      abortCount: 2,
      inProgress: true,
    });

    expect(parseManualInProgressSummary(summary)).toEqual({
      events: [],
      abortCount: 2,
    });
  });
});
