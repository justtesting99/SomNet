import { describe, expect, it, beforeEach } from 'vitest';
import {
  clearDeviceAutomaticRunningLocalStore,
  readDeviceAutomaticRunningLocal,
  writeDeviceAutomaticRunningLocal,
} from '@/utils/deviceAutomaticRunningLocal';

describe('deviceAutomaticRunningLocal', () => {
  beforeEach(() => {
    clearDeviceAutomaticRunningLocalStore();
  });

  it('remembers running per device and kind', () => {
    writeDeviceAutomaticRunningLocal('Slv66', 'esp32-MOTOR1', 'motor', true);
    writeDeviceAutomaticRunningLocal('Slv66', 'esp32-RELAY1', 'relay', false);

    expect(readDeviceAutomaticRunningLocal('Slv66', 'esp32-MOTOR1', 'motor')).toBe(true);
    expect(readDeviceAutomaticRunningLocal('Slv66', 'esp32-RELAY1', 'relay')).toBe(false);
    expect(readDeviceAutomaticRunningLocal('Slv66', 'esp32-RELAY1', 'motor')).toBe(false);
  });

  it('clears entry when running becomes false', () => {
    writeDeviceAutomaticRunningLocal('Slv66', 'esp32-MOTOR1', 'motor', true);
    writeDeviceAutomaticRunningLocal('Slv66', 'esp32-MOTOR1', 'motor', false);
    expect(readDeviceAutomaticRunningLocal('Slv66', 'esp32-MOTOR1', 'motor')).toBe(false);
  });
});
