export type DeviceButtonClickType = 'single' | 'double';

export interface DeviceButtonEvent {
  clickType: DeviceButtonClickType;
  deviceId: string;
  subTarget: string;
  occurredAtUtc?: string | null;
}

export const HARDWARE_HUB_BUTTON_EVENT_RECEIVED = 'ButtonEventReceived';
