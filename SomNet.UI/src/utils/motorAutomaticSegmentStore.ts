import type { MotorAutomaticSegmentEvent } from '@/utils/motorAutomaticSegmentJson';

const EMPTY: MotorAutomaticSegmentEvent[] = [];

type Listener = () => void;

const segmentsByDeviceId: Record<string, MotorAutomaticSegmentEvent[]> = {};
const graphFingerprintByDeviceId: Record<string, string> = {};
const listeners = new Set<Listener>();

function notify(): void {
  for (const listener of listeners) {
    listener();
  }
}

export function subscribeMotorAutomaticSegments(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getMotorAutomaticSegments(deviceId: string): MotorAutomaticSegmentEvent[] {
  if (!deviceId) {
    return EMPTY;
  }
  return segmentsByDeviceId[deviceId] ?? EMPTY;
}

export function getMotorAutomaticGraphFingerprint(deviceId: string): string | undefined {
  if (!deviceId) {
    return undefined;
  }
  return graphFingerprintByDeviceId[deviceId];
}

/** Start (or restart) a live graph recording for this device. */
export function beginMotorAutomaticGraphRecording(deviceId: string, settingsFingerprint: string): void {
  if (!deviceId) {
    return;
  }

  segmentsByDeviceId[deviceId] = [];
  graphFingerprintByDeviceId[deviceId] = settingsFingerprint;
  notify();
}

export function motorAutomaticGraphRecordingActive(
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

export function recordMotorAutomaticSegment(
  deviceId: string,
  segment: MotorAutomaticSegmentEvent,
): void {
  if (!deviceId) {
    return;
  }

  const existing = segmentsByDeviceId[deviceId] ?? [];
  const next = [
    ...existing.filter((row) => row.programElapsedMs !== segment.programElapsedMs),
    segment,
  ].sort((left, right) => left.programElapsedMs - right.programElapsedMs);

  segmentsByDeviceId[deviceId] = next;
  notify();
}

/** Clear segment points only — keeps fingerprint (device segment #0 after Start). */
export function resetMotorAutomaticSegmentEvents(deviceId: string): void {
  if (!deviceId) {
    return;
  }

  if (graphFingerprintByDeviceId[deviceId] === undefined) {
    clearMotorAutomaticGraphRecording(deviceId);
    return;
  }

  segmentsByDeviceId[deviceId] = [];
  notify();
}

/** Drop recorded segments and fingerprint (settings changed or explicit reset). */
export function clearMotorAutomaticGraphRecording(deviceId: string): void {
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

/** @deprecated use clearMotorAutomaticGraphRecording */
export function clearMotorAutomaticSegments(deviceId: string): void {
  clearMotorAutomaticGraphRecording(deviceId);
}
