import { describe, expect, it } from 'vitest';
import { activeSessionForSub } from '@/utils/sessionForSub';

describe('activeSessionForSub', () => {
  it('returns null when session belongs to another Sub', () => {
    expect(
      activeSessionForSub(
        { id: '1', subTarget: 'Slv66', mode: 'automatic' },
        'Slv67',
      ),
    ).toBeNull();
  });

  it('returns session when Sub matches', () => {
    const session = { id: '1', subTarget: 'Slv66', mode: 'automatic' };
    expect(activeSessionForSub(session, 'Slv66')).toBe(session);
  });
});
