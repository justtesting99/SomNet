import type { MotorAutomaticSegmentEvent } from '@/utils/motorAutomaticSegmentJson';

const EMPTY: MotorAutomaticSegmentEvent[] = [];

type Listener = () => void;

const segmentsByDeviceId: Record<string, MotorAutomaticSegmentEvent[]> = {};
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

export function recordMotorAutomaticSegment(
  deviceId: string,
  segment: MotorAutomaticSegmentEvent,
): void {
  if (!deviceId) {
    return;
  }

  const existing = segmentsByDeviceId[deviceId] ?? [];
  const next = [
    ...existing.filter((row) => row.segmentIndex !== segment.segmentIndex),
    segment,
  ].sort((left, right) => left.segmentIndex - right.segmentIndex);

  segmentsByDeviceId[deviceId] = next;
  notify();
}

export function clearMotorAutomaticSegments(deviceId: string): void {
  if (!deviceId || !(deviceId in segmentsByDeviceId)) {
    return;
  }

  delete segmentsByDeviceId[deviceId];
  notify();
}
