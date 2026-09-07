import type { AutomaticControlState } from '@/types/modes';

/** Build automatic-start payload (P9P2-D4): full snapshot, omit UI-only `running`. */
export function buildAutomaticStartPayload(state: AutomaticControlState): string {
  const { running: _running, ...snapshot } = state;
  return JSON.stringify(snapshot);
}
