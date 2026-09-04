import type { ConnectionState, SystemStatusResponse, SystemStatusSnapshot } from '@/types/systemStatus';

function normalizeState(value: string | undefined, fallback: ConnectionState): ConnectionState {
  if (value === 'online' || value === 'connected') {
    return 'online';
  }
  if (value === 'offline' || value === 'disconnected') {
    return 'offline';
  }
  if (value === 'connecting') {
    return 'connecting';
  }
  return fallback;
}

export function buildSystemStatus(
  response: SystemStatusResponse | null,
  apiReachable: boolean,
): SystemStatusSnapshot {
  if (!apiReachable || !response) {
    return {
      api: 'offline',
      device: 'unknown',
      signalR: 'unknown',
      summary: 'API unreachable',
      detail: 'Cannot connect to SomNet API. Commands will not be sent until the connection is restored.',
      isReady: false,
      lastChecked: new Date(),
    };
  }

  const api = normalizeState(response.api, 'online');
  const device = normalizeState(response.device, 'offline');
  const signalR = normalizeState(response.signalR, 'offline');
  const isReady = api === 'online' && device === 'online' && signalR === 'online';

  if (isReady) {
    const deviceLabel = response.deviceName ? ` (${response.deviceName})` : '';
    return {
      api,
      device,
      signalR,
      summary: 'Ready',
      detail: response.message ?? `Device online${deviceLabel}. System is ready to accept commands.`,
      isReady: true,
      lastChecked: new Date(),
    };
  }

  const issues: string[] = [];
  if (api !== 'online') issues.push('API offline');
  if (device !== 'online') issues.push('Device not connected');
  if (signalR !== 'online') issues.push('SignalR link down');

  return {
    api,
    device,
    signalR,
    summary: issues.join(' · '),
    detail:
      response.message ??
      'The application is connected to the API, but the device or real-time link is not ready.',
    isReady: false,
    lastChecked: new Date(),
  };
}

export function getOverallTone(
  status: SystemStatusSnapshot,
): 'ready' | 'warning' | 'error' | 'checking' {
  if (status.api === 'connecting' || status.api === 'unknown') {
    return 'checking';
  }
  if (status.isReady) {
    return 'ready';
  }
  if (status.api === 'offline') {
    return 'error';
  }
  return 'warning';
}
