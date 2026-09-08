import { describe, expect, it } from 'vitest';
import { parseAutomaticResultJson, isAutomaticStopResultJson } from '@/utils/automaticResultJson';
import { buildAutomaticSessionSummary } from '@/utils/sessionSummary';

describe('parseAutomaticResultJson', () => {
  it('parses device automatic-stop summary', () => {
    const parsed = parseAutomaticResultJson(
      '{"commandKey":"automatic-stop","automaticMode":"periodic","strokesCompleted":8,"durationMs":120000,"endReason":"manualStop","interrupted":false}',
    );

    expect(parsed?.automaticMode).toBe('periodic');
    expect(parsed?.strokesCompleted).toBe(8);
    expect(parsed?.durationMs).toBe(120_000);
  });

  it('returns null for invalid JSON', () => {
    expect(parseAutomaticResultJson('not-json')).toBeNull();
  });
});

describe('isAutomaticStopResultJson', () => {
  it('accepts automatic-stop summaries', () => {
    expect(
      isAutomaticStopResultJson({
        commandKey: 'automatic-stop',
        strokesCompleted: 8,
      }),
    ).toBe(true);
  });

  it('rejects other command keys', () => {
    expect(isAutomaticStopResultJson({ commandKey: 'burst' })).toBe(false);
    expect(isAutomaticStopResultJson(null)).toBe(false);
  });
});

describe('buildAutomaticSessionSummary', () => {
  it('builds summary from device resultJson fields', () => {
    const summary = buildAutomaticSessionSummary({
      automaticMode: 'periodic',
      strokesCompleted: 8,
      durationMs: 120_000,
      endReason: 'manualStop',
    });

    expect(summary).toBe('Periodic — 8 main strokes over 2 min (stopped manually).');
  });

  it('builds summary for aborted automatic session', () => {
    const summary = buildAutomaticSessionSummary({
      automaticMode: 'periodic',
      strokesCompleted: 4,
      durationMs: 20_000,
      endReason: 'abort',
      interrupted: true,
    });

    expect(summary).toBe('Periodic — 4 main strokes over 20 sec (aborted).');
  });

  it('includes burst event counts when burstsOn', () => {
    const summary = buildAutomaticSessionSummary({
      automaticMode: 'periodic',
      burstsOn: true,
      mainStrokesCompleted: 8,
      strokesCompleted: 8,
      burstEventsCompleted: 4,
      durationMs: 120_000,
      endReason: 'endSession',
    });

    expect(summary).toBe(
      'Periodic — 8 main strokes, 4 burst events over 2 min (end session rule).',
    );
  });

  it('falls back when device result is missing', () => {
    expect(buildAutomaticSessionSummary(null, 'stopped manually')).toBe(
      'Automatic session stopped manually.',
    );
  });
});
