export interface DeviceStatusResponse {
  domTarget: string;
  subTarget: string;
  isPaired: boolean;
  isConnected: boolean;
  deviceId?: string | null;
  pairedAt?: string | null;
  lastConnectedAt?: string | null;
  tokenExpiresAt?: string | null;
}

export interface PairDeviceResponse {
  deviceId: string;
  domTarget: string;
  subTarget: string;
  accessToken: string;
  expiresAt: string;
  deliveredToDevice: boolean;
  message?: string | null;
}

export interface SendHardwareCommandResponse {
  correlationId: string;
  delivered: boolean;
  acknowledged: boolean;
  success: boolean;
  message?: string | null;
  resultJson?: string | null;
}

export interface UnpairedDeviceResponse {
  deviceId: string;
  connectedAt: string;
}
