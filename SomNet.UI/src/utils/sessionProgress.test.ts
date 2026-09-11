import { describe, expect, it } from 'vitest';
import {
  isRehydratableAutomaticSession,
  isRehydratableManualSession,
  isSessionInProgress,
} from '@/utils/sessionProgress';
import type { SessionHistoryEntry } from '@/types/sessionHistory';

const baseEntry: SessionHistoryEntry = {
  id: 'sess-001',
  startedAt: '2026-09-10T12:00:00Z',
  domTarget: 'demo',
  subTarget: 'Slv66',
  mode: 'automatic',
  summary: 'In progress',
};

describe('isSessionInProgress', () => {
  it('matches exact in progress', () => {
    expect(isSessionInProgress('In progress')).toBe(true);
  });

  it('matches prefixed manual progress', () => {
    expect(isSessionInProgress('In progress: 2 strokes at 60%.')).toBe(true);
  });

  it('rejects completed summary', () => {
    expect(isSessionInProgress('Automatic session ran 20 strokes.')).toBe(false);
  });
});

describe('isRehydratableAutomaticSession', () => {
  it('accepts automatic with exact in progress summary', () => {
    expect(isRehydratableAutomaticSession(baseEntry)).toBe(true);
  });

  it('rejects manual session', () => {
    expect(
      isRehydratableAutomaticSession({ ...baseEntry, mode: 'manual' }),
    ).toBe(false);
  });

  it('rejects automatic with partial progress summary', () => {
    expect(
      isRehydratableAutomaticSession({
        ...baseEntry,
        summary: 'In progress: partial',
      }),
    ).toBe(false);
  });
});

describe('isRehydratableManualSession', () => {
  it('accepts manual session with prefixed progress summary', () => {
    expect(
      isRehydratableManualSession({
        ...baseEntry,
        mode: 'manual',
        summary: 'In progress: 2 strokes at 60%.',
      }),
    ).toBe(true);
  });

  it('rejects completed manual session', () => {
    expect(
      isRehydratableManualSession({
        ...baseEntry,
        mode: 'manual',
        summary: '2 strokes at 60%.',
      }),
    ).toBe(false);
  });
});
