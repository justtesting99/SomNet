import type { RelayAutomaticSegmentEvent } from '@/utils/relayAutomaticSegmentJson';

const EMPTY: RelayAutomaticSegmentEvent[] = [];

type Listener = () => void;

const segmentsByDeviceId: Record<string, RelayAutomaticSegmentEvent[]> = {};
const listeners = new Set<Listener>();

function notify(): void {
  listeners.forEach((listener) => listener());
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

export function recordRelayAutomaticSegment(
  deviceId: string,
  segment: RelayAutomaticSegmentEvent,
): void {
  if (!deviceId) {
    return;
  }

  const existing = segmentsByDeviceId[deviceId] ?? [];
  segmentsByDeviceId[deviceId] = [...existing, segment];
  notify();
}

export function clearRelayAutomaticSegments(deviceId: string): void {
  if (!deviceId) {
    return;
  }

  if (!(deviceId in segmentsByDeviceId)) {
    return;
  }

  delete segmentsByDeviceId[deviceId];
  notify();
}
