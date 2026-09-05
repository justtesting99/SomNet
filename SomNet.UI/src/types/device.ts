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
