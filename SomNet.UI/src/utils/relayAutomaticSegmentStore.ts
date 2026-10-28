import type { RelayAutomaticSegmentEvent } from '@/utils/relayAutomaticSegmentJson';

const EMPTY: RelayAutomaticSegmentEvent[] = [];

type Listener = () => void;

const segmentsByDeviceId: Record<string, RelayAutomaticSegmentEvent[]> = {};
const graphFingerprintByDeviceId: Record<string, string> = {};
const listeners = new Set<Listener>();

function segmentEventKey(segment: RelayAutomaticSegmentEvent): string {
  return `${segment.programElapsedMs}:${segment.phase}:${segment.durationMs}:${segment.powerPercent}`;
}

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeRelayAutomaticSegments(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRelayAutomaticSegments(deviceId: string): RelayAutomaticSegmentEvent[] {
  if (!deviceId) {
    return EMPTY;
  }
  return segmentsByDeviceId[deviceId] ?? EMPTY;
}

export function getRelayAutomaticGraphFingerprint(deviceId: string): string | undefined {
  if (!deviceId) {
    return undefined;
  }
  return graphFingerprintByDeviceId[deviceId];
}

/** Start (or restart) a live graph recording for this device. */
export function beginRelayAutomaticGraphRecording(
  deviceId: string,
  settingsFingerprint: string,
): void {
  if (!deviceId) {
    return;
  }

  segmentsByDeviceId[deviceId] = [];
  graphFingerprintByDeviceId[deviceId] = settingsFingerprint;
  notify();
}

export function relayAutomaticGraphRecordingActive(
  deviceId: string,
  settingsFingerprint: string,
): boolean {
  if (!deviceId) {
    return false;
  }
  const stored = graphFingerprintByDeviceId[deviceId];
  if (stored === undefined || stored !== settingsFingerprint) {
    return false;
  }
  return (segmentsByDeviceId[deviceId]?.length ?? 0) > 0;
}

export function recordRelayAutomaticSegment(
  deviceId: string,
  segment: RelayAutomaticSegmentEvent,
): void {
  if (!deviceId) {
    return;
  }

  const key = segmentEventKey(segment);
  const existing = segmentsByDeviceId[deviceId] ?? [];
  const next = [
    ...existing.filter((row) => segmentEventKey(row) !== key),
    segment,
  ].sort((left, right) => left.programElapsedMs - right.programElapsedMs);

  segmentsByDeviceId[deviceId] = next;
  notify();
}

/** Clear segment points only — keeps fingerprint (device segment #0 after Start). */
export function resetRelayAutomaticSegmentEvents(deviceId: string): void {
  if (!deviceId) {
    return;
  }

  if (graphFingerprintByDeviceId[deviceId] === undefined) {
    clearRelayAutomaticGraphRecording(deviceId);
    return;
  }

  segmentsByDeviceId[deviceId] = [];
  notify();
}

/** Drop recorded segments and fingerprint (settings changed or explicit reset). */
export function clearRelayAutomaticGraphRecording(deviceId: string): void {
  if (!deviceId) {
    return;
  }

  let changed = false;
  if (deviceId in segmentsByDeviceId) {
    delete segmentsByDeviceId[deviceId];
    changed = true;
  }
  if (deviceId in graphFingerprintByDeviceId) {
    delete graphFingerprintByDeviceId[deviceId];
    changed = true;
  }
  if (changed) {
    notify();
  }
}

/** @deprecated use clearRelayAutomaticGraphRecording */
export function clearRelayAutomaticSegments(deviceId: string): void {
  clearRelayAutomaticGraphRecording(deviceId);
}
