import { describe, expect, it } from 'vitest';
import { formatSessionDeviceLabel } from '@/utils/sessionHistoryDevice';
import type { DeviceRegistration } from '@/types/device';

const registrations: DeviceRegistration[] = [
  {
    deviceId: 'esp32-RELAY111111',
    domTarget: 'demo',
    subTarget: 'Slv66',
    isConnected: true,
    pairedAt: '2026-01-01T00:00:00Z',
    tokenExpiresAt: '2099-01-01T00:00:00Z',
    actuatorKind: 'relay',
  },
  {
    deviceId: 'esp32-MOTOR222222',
    domTarget: 'demo',
    subTarget: 'Slv66',
    isConnected: true,
    pairedAt: '2026-01-01T00:00:00Z',
    tokenExpiresAt: '2099-01-01T00:00:00Z',
    actuatorKind: 'hbridge',
  },
];

describe('formatSessionDeviceLabel', () => {
  it('labels known motor registration', () => {
    expect(
      formatSessionDeviceLabel('esp32-MOTOR222222', registrations, 'Slv66'),
    ).toBe('Motor · esp32-MOTOR222222');
  });

  it('returns legacy label when device id missing', () => {
    expect(formatSessionDeviceLabel(null, registrations, 'Slv66')).toBe('Legacy session');
  });

  it('returns raw id when registration unknown', () => {
    expect(formatSessionDeviceLabel('esp32-UNKNOWN', registrations, 'Slv66')).toBe('esp32-UNKNOWN');
  });
});
