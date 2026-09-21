import type { SessionActionSnapshot } from '@/api/videoSnapshots';

export type SnapshotActionMode = 'manual' | 'automatic';

const MANUAL_COMMAND_LABELS: Record<string, string> = {
  stroke: 'Manual stroke',
  burst: 'Manual burst',
  'manual:stroke': 'Manual stroke',
  'manual:burst': 'Manual burst',
};

function primarySnapshot(actionSnapshots: SessionActionSnapshot[]): SessionActionSnapshot | undefined {
  return actionSnapshots[0];
}

export function modeForSnapshotGroup(
  actionSnapshots: SessionActionSnapshot[],
): SnapshotActionMode | null {
  const primary = primarySnapshot(actionSnapshots);
  if (!primary) {
    return null;
  }

  const commandKey = primary.commandKey?.toLowerCase();
  if (commandKey && MANUAL_COMMAND_LABELS[commandKey]) {
    return 'manual';
  }

  if (
    commandKey === 'automatic-stop' ||
    primary.correlationId === 'automatic-session-complete'
  ) {
    return 'automatic';
  }

  if (primary.actionSummary?.toLowerCase().startsWith('manual ')) {
    return 'manual';
  }

  return null;
}

export function captionForSnapshotGroup(
  actionSnapshots: SessionActionSnapshot[],
): string {
  const primary = primarySnapshot(actionSnapshots);
  if (!primary) {
    return 'Action';
  }

  const stored = primary.actionSummary?.trim();
  if (stored) {
    return stored;
  }

  const commandKey = primary.commandKey?.toLowerCase();
  if (commandKey && MANUAL_COMMAND_LABELS[commandKey]) {
    return MANUAL_COMMAND_LABELS[commandKey];
  }

  if (
    commandKey === 'automatic-stop' ||
    primary.correlationId === 'automatic-session-complete'
  ) {
    return 'Automatic session';
  }

  return `Action ${primary.actionIndex + 1}`;
}
