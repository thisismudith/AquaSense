import { BLE_PROTOCOL } from '@/config/ble';
import type { ParameterId } from '@/config/parameters';

/** Phone → device commands (PROVISIONAL contract, see src/config/ble.ts). */
export type DeviceCommand =
  | { cmd: 'hello' }
  | { cmd: 'set_time'; epoch_ms: number; tz_offset_min: number }
  | { cmd: 'get_status' }
  | { cmd: 'start_measurement'; parameter: ParameterId }
  | { cmd: 'get_results'; after: string | null; limit: number }
  | { cmd: 'set_calibration'; parameter: ParameterId; slope: number; intercept: number; version: number };

export function serializeCommand(id: number, c: DeviceCommand): string {
  return JSON.stringify({ v: BLE_PROTOCOL.protocolVersion, id, ...c });
}

export const DEVICE_ERROR_CODES = ['busy', 'unknown_command', 'invalid_args', 'no_calibration', 'storage_error', 'hardware_fault'] as const;
