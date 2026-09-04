export type ConnectionState = 'unknown' | 'connecting' | 'online' | 'offline';

export interface SystemStatusSnapshot {
  api: ConnectionState;
  device: ConnectionState;
  signalR: ConnectionState;
  summary: string;
  detail: string;
  isReady: boolean;
  lastChecked: Date | null;
}

export interface SystemStatusResponse {
  api?: ConnectionState;
  device?: ConnectionState;
  signalR?: ConnectionState;
  message?: string;
  deviceName?: string;
}

export const initialSystemStatus: SystemStatusSnapshot = {
  api: 'unknown',
  device: 'unknown',
  signalR: 'unknown',
  summary: 'Checking system status…',
  detail: 'Waiting for first connection check.',
  isReady: false,
  lastChecked: null,
};
