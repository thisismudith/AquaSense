import { BleErrorCode, BleManager, type BleError as PlxError, type Subscription } from 'react-native-ble-plx';

import { BLE_PROTOCOL } from '@/config/ble';
import { base64Decode, base64Encode } from '@/utils/codec';

import { BleError, type AdapterState, type BleConnection, type BleErrorCode as AppCode, type BleTransport, type ScannedDevice, type Unsubscribe } from './BLETypes';

function mapError(e: unknown, fallback: AppCode): BleError {
  if (e instanceof BleError) return e;
  const plx = e as Partial<PlxError> | null;
  const msg = plx?.reason ?? plx?.message ?? String(e);
  switch (plx?.errorCode) {
    case BleErrorCode.BluetoothPoweredOff:
      return new BleError('bluetooth_off', msg);
    case BleErrorCode.BluetoothUnauthorized:
      return new BleError('unauthorized', msg);
    case BleErrorCode.BluetoothUnsupported:
      return new BleError('unsupported', msg);
    case BleErrorCode.DeviceNotFound:
      return new BleError('device_not_found', msg);
    case BleErrorCode.DeviceDisconnected:
      return new BleError('disconnected', msg);
    case BleErrorCode.OperationTimedOut:
      return new BleError('connect_timeout', msg);
    case BleErrorCode.ServiceNotFound:
    case BleErrorCode.CharacteristicNotFound:
      return new BleError('service_not_found', msg);
    default:
      return new BleError(fallback, msg);
  }
}

class PlxConnection implements BleConnection {
  private notifyCbs = new Set<(b: Uint8Array) => void>();
  private discCbs = new Set<(e: BleError | null) => void>();
  private subs: Subscription[] = [];
  private requested = false;
  private closed = false;

  constructor(
    private readonly manager: BleManager,
    readonly deviceId: string,
    readonly name: string | null,
    readonly mtu: number,
    private readonly withResponse: boolean,
  ) {}

  start(): void {
    this.subs.push(
      this.manager.monitorCharacteristicForDevice(this.deviceId, BLE_PROTOCOL.serviceUuid, BLE_PROTOCOL.txCharacteristicUuid, (error, ch) => {
        if (error) {
          // Monitor errors also fire on disconnect; the disconnect listener reports those.
          if (error.errorCode !== BleErrorCode.OperationCancelled && error.errorCode !== BleErrorCode.DeviceDisconnected) {
            console.warn('[BLE] notify error', error.errorCode, error.reason ?? error.message);
          }
          return;
        }
        if (!ch?.value) return;
        let bytes: Uint8Array;
        try {
          bytes = base64Decode(ch.value);
        } catch (e) {
          console.warn('[BLE] invalid base64 notification', e);
          return;
        }
        this.notifyCbs.forEach((cb) => cb(bytes));
      }),
    );
    this.subs.push(
      this.manager.onDeviceDisconnected(this.deviceId, (error) => {
        if (this.closed) return;
        this.closed = true;
        this.subs.forEach((s) => s.remove());
        const err = this.requested ? null : error ? mapError(error, 'disconnected') : new BleError('disconnected', 'Device disconnected');
        this.discCbs.forEach((cb) => cb(err));
      }),
    );
  }

  onNotify(cb: (b: Uint8Array) => void): Unsubscribe {
    this.notifyCbs.add(cb);
    return () => this.notifyCbs.delete(cb);
  }

  onDisconnect(cb: (e: BleError | null) => void): Unsubscribe {
    this.discCbs.add(cb);
    return () => this.discCbs.delete(cb);
  }

  async write(bytes: Uint8Array): Promise<void> {
    const b64 = base64Encode(bytes);
    try {
      if (this.withResponse) {
        await this.manager.writeCharacteristicWithResponseForDevice(this.deviceId, BLE_PROTOCOL.serviceUuid, BLE_PROTOCOL.rxCharacteristicUuid, b64);
      } else {
        await this.manager.writeCharacteristicWithoutResponseForDevice(this.deviceId, BLE_PROTOCOL.serviceUuid, BLE_PROTOCOL.rxCharacteristicUuid, b64);
      }
    } catch (e) {
      throw mapError(e, 'write_failed');
    }
  }

  async disconnect(): Promise<void> {
    this.requested = true;
    try {
      await this.manager.cancelDeviceConnection(this.deviceId);
    } catch (e) {
      const err = mapError(e, 'unknown');
      if (err.code !== 'disconnected' && err.code !== 'device_not_found') throw err;
    }
  }
}

/** Native transport (react-native-ble-plx). Requires a development or release build — not Expo Go. */
export class BlePlxTransport implements BleTransport {
  readonly kind = 'native' as const;
  private readonly manager = new BleManager();

  async getState(): Promise<AdapterState> {
    return (await this.manager.state()) as AdapterState;
  }

  onStateChange(cb: (s: AdapterState) => void): Unsubscribe {
    const sub = this.manager.onStateChange((s) => cb(s as AdapterState), true);
    return () => sub.remove();
  }

  async startScan(onDevice: (d: ScannedDevice) => void, onError: (e: BleError) => void): Promise<void> {
    // No service filter: some ESP32 builds advertise the name but not the 128-bit UUID (scan response size).
    await this.manager.startDeviceScan(null, { allowDuplicates: false }, (error, device) => {
      if (error) return onError(mapError(error, 'unknown'));
      if (!device) return;
      onDevice({ id: device.id, name: device.localName ?? device.name ?? null, rssi: device.rssi ?? null, serviceUuids: device.serviceUUIDs ?? [] });
    });
  }

  async stopScan(): Promise<void> {
    await this.manager.stopDeviceScan();
  }

  async connect(deviceId: string, opts: { timeoutMs: number; mtu: number }): Promise<BleConnection> {
    try {
      let device = await this.manager.connectToDevice(deviceId, { timeout: opts.timeoutMs, requestMTU: opts.mtu });
      device = await device.discoverAllServicesAndCharacteristics();
      const chars = await device.characteristicsForService(BLE_PROTOCOL.serviceUuid).catch(() => []);
      const rx = chars.find((c) => c.uuid.toLowerCase() === BLE_PROTOCOL.rxCharacteristicUuid);
      const tx = chars.find((c) => c.uuid.toLowerCase() === BLE_PROTOCOL.txCharacteristicUuid);
      if (!rx || !tx || !(tx.isNotifiable || tx.isIndicatable)) {
        await this.manager.cancelDeviceConnection(deviceId).catch(() => undefined);
        throw new BleError('service_not_found', 'AquaSense service/characteristics not found on this device');
      }
      const conn = new PlxConnection(this.manager, deviceId, device.localName ?? device.name ?? null, device.mtu ?? BLE_PROTOCOL.defaultMtu, !rx.isWritableWithoutResponse);
      conn.start();
      return conn;
    } catch (e) {
      throw mapError(e, 'connect_failed');
    }
  }
}
