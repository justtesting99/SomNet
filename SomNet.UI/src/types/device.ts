export type ActuatorKind = 'relay' | 'hbridge';

export interface DeviceRegistration {
  deviceId: string;
  domTarget: string;
  subTarget: string;
  isConnected: boolean;
  pairedAt: string;
  lastConnectedAt?: string | null;
  tokenExpiresAt: string;
  actuatorKind: ActuatorKind;
}

export interface DeviceStatusResponse {
  domTarget: string;
  subTarget: string;
  deviceId: string;
  isPaired: boolean;
  isConnected: boolean;
  pairedAt?: string | null;
  lastConnectedAt?: string | null;
  tokenExpiresAt?: string | null;
  actuatorKind?: ActuatorKind | null;
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
