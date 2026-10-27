import type { OperationMode } from '@/types/modes';

const VALID_MODES = new Set<OperationMode>(['manual', 'automatic']);

export function isValidOperationMode(value: string): value is OperationMode {
  return VALID_MODES.has(value as OperationMode);
}
