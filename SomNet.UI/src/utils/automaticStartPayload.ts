import type { AutomaticControlState } from '@/types/modes';
import { normalizeAutomaticControlState } from '@/utils/automaticFieldRules';

/** Build automatic-start payload (P9P2-D4): full snapshot, omit UI-only `running`. */
export function buildAutomaticStartPayload(state: AutomaticControlState): string {
  const normalized = normalizeAutomaticControlState(state);
  const { running: _running, ...snapshot } = normalized;
  return JSON.stringify(snapshot);
}
