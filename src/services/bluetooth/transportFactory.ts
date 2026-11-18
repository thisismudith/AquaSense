import type { BleTransport } from './BLETypes';

/**
 * Selects the BLE transport.
 * - Release builds: always the native transport. The mock is unreachable (`__DEV__` is false).
 * - Development: mock only when EXPO_PUBLIC_BLE_MOCK=1 is set explicitly (UI work without hardware).
 * Returns null when the native module is unavailable (e.g. Expo Go); callers show a clear error.
 */
export function createTransport(): BleTransport | null {
  if (__DEV__ && process.env.EXPO_PUBLIC_BLE_MOCK === '1') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { MockBLETransport, MockESP32 } = require('./MockBLETransport') as typeof import('./MockBLETransport');
    console.warn('[BLE] MOCK transport active (EXPO_PUBLIC_BLE_MOCK=1). Results are simulated.');
    return new MockBLETransport([new MockESP32({ measurementMs: 4000 })]);
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { BlePlxTransport } = require('./BlePlxTransport') as typeof import('./BlePlxTransport');
    return new BlePlxTransport();
  } catch (e) {
    console.warn('[BLE] native BLE module unavailable', e);
    return null;
  }
}

export const isMockTransport = (t: BleTransport | null): boolean => t?.kind === 'mock';
