/** Transport-level BLE contract. Implemented by BlePlxTransport (device) and MockBLETransport (tests/dev only). */

export type AdapterState = 'PoweredOn' | 'PoweredOff' | 'Unauthorized' | 'Unsupported' | 'Resetting' | 'Unknown';

export interface ScannedDevice {
  id: string;
  name: string | null;
  rssi: number | null;
  serviceUuids: string[];
}

export type Unsubscribe = () => void;

export interface BleConnection {
  readonly deviceId: string;
  readonly name: string | null;
  /** Negotiated ATT MTU. Payload per write = mtu − 3. */
  readonly mtu: number;
  write(bytes: Uint8Array): Promise<void>;
  onNotify(cb: (bytes: Uint8Array) => void): Unsubscribe;
  /** Fires once on any disconnect; `error` is null for a requested disconnect. */
  onDisconnect(cb: (error: BleError | null) => void): Unsubscribe;
  disconnect(): Promise<void>;
}

export interface BleTransport {
  readonly kind: 'native' | 'mock';
  getState(): Promise<AdapterState>;
  onStateChange(cb: (s: AdapterState) => void): Unsubscribe;
  startScan(onDevice: (d: ScannedDevice) => void, onError: (e: BleError) => void): Promise<void>;
  stopScan(): Promise<void>;
  connect(deviceId: string, opts: { timeoutMs: number; mtu: number }): Promise<BleConnection>;
}

export type BleErrorCode =
  | 'bluetooth_off'
  | 'unauthorized'
  | 'unsupported'
  | 'permission_denied'
  | 'device_not_found'
  | 'connect_timeout'
  | 'connect_failed'
  | 'service_not_found'
  | 'disconnected'
  | 'write_failed'
  | 'command_timeout'
  | 'device_error'
  | 'protocol_error'
  | 'busy'
  | 'native_unavailable'
  | 'unknown';

export class BleError extends Error {
  constructor(
    public readonly code: BleErrorCode,
    message?: string,
    public readonly deviceCode?: string,
  ) {
    super(message ?? code);
    this.name = 'BleError';
  }
}
