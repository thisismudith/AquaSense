/** UNIT with mocked react-native-ble-plx: verifies adapter wiring only. Not a hardware test. */
import { BLE_PROTOCOL } from '@/config/ble';
import { utf8Decode } from '@/utils/codec';

type Listener = (error: unknown, value: unknown) => void;
const native = {
  monitor: null as Listener | null,
  disconnect: null as ((e: unknown) => void) | null,
  writes: [] as string[],
  chars: [] as { uuid: string; isNotifiable: boolean; isIndicatable: boolean; isWritableWithoutResponse: boolean }[],
  connectError: null as unknown,
  cancelled: 0,
};

jest.mock('react-native-ble-plx', () => {
  const BleErrorCode = { OperationCancelled: 2, BluetoothUnsupported: 100, BluetoothUnauthorized: 101, BluetoothPoweredOff: 102, DeviceConnectionFailed: 200, DeviceDisconnected: 201, DeviceNotFound: 205, OperationTimedOut: 3, ServiceNotFound: 300, CharacteristicNotFound: 400 };
  class BleManager {
    state = async () => 'PoweredOn';
    onStateChange = (cb: (s: string) => void) => {
      cb('PoweredOn');
      return { remove: jest.fn() };
    };
    startDeviceScan = async (_u: unknown, _o: unknown, cb: Listener) => cb(null, { id: 'AA', localName: 'SipSure-1', name: null, rssi: -50, serviceUUIDs: null });
    stopDeviceScan = async () => undefined;
    connectToDevice = async (id: string) => {
      if (native.connectError) throw native.connectError;
      const dev = { id, localName: 'SipSure-1', name: null, mtu: 185, discoverAllServicesAndCharacteristics: async () => dev, characteristicsForService: async () => native.chars };
      return dev;
    };
    cancelDeviceConnection = async () => {
      native.cancelled++;
    };
    monitorCharacteristicForDevice = (_d: string, _s: string, _c: string, l: Listener) => {
      native.monitor = l;
      return { remove: jest.fn() };
    };
    onDeviceDisconnected = (_d: string, l: (e: unknown) => void) => {
      native.disconnect = l;
      return { remove: jest.fn() };
    };
    writeCharacteristicWithResponseForDevice = async (_d: string, _s: string, _c: string, v: string) => {
      native.writes.push(v);
    };
    writeCharacteristicWithoutResponseForDevice = async (_d: string, _s: string, _c: string, v: string) => {
      native.writes.push(`nr:${v}`);
    };
  }
  return { BleManager, BleErrorCode };
});

// eslint-disable-next-line import/first
import { BlePlxTransport } from '@/services/bluetooth/BlePlxTransport';

const goodChars = () => [
  { uuid: BLE_PROTOCOL.rxCharacteristicUuid.toUpperCase(), isNotifiable: false, isIndicatable: false, isWritableWithoutResponse: false },
  { uuid: BLE_PROTOCOL.txCharacteristicUuid, isNotifiable: true, isIndicatable: false, isWritableWithoutResponse: false },
];

beforeEach(() => {
  native.writes = [];
  native.chars = goodChars();
  native.connectError = null;
  native.cancelled = 0;
});

describe('BlePlxTransport (UNIT, mocked native module)', () => {
  it('scans and maps device fields', async () => {
    const t = new BlePlxTransport();
    const seen: unknown[] = [];
    await t.startScan((d) => seen.push(d), jest.fn());
    expect(seen).toEqual([{ id: 'AA', name: 'SipSure-1', rssi: -50, serviceUuids: [] }]);
    expect(await t.getState()).toBe('PoweredOn');
  });

  it('connects, base64-encodes writes, decodes notifications, reports disconnects', async () => {
    const t = new BlePlxTransport();
    const c = await t.connect('AA', { timeoutMs: 1000, mtu: 185 });
    expect(c.mtu).toBe(185);
    await c.write(Uint8Array.from([0x7b, 0x7d, 0x0a]));
    expect(native.writes).toEqual(['e30K']);
    const got: string[] = [];
    c.onNotify((b) => got.push(utf8Decode(b)));
    native.monitor?.(null, { value: 'e30K' });
    native.monitor?.(null, { value: '@@not-base64' });
    expect(got).toEqual(['{}\n']);
    const errs: unknown[] = [];
    c.onDisconnect((e) => errs.push(e));
    native.disconnect?.({ errorCode: 201, reason: 'link lost' });
    expect(errs).toEqual([expect.objectContaining({ code: 'disconnected' })]);
  });

  it('requested disconnect reports null error', async () => {
    const t = new BlePlxTransport();
    const c = await t.connect('AA', { timeoutMs: 1000, mtu: 185 });
    const errs: unknown[] = [];
    c.onDisconnect((e) => errs.push(e));
    await c.disconnect();
    native.disconnect?.(null);
    expect(errs).toEqual([null]);
  });

  it('rejects devices without the SipSure service and disconnects them', async () => {
    native.chars = [];
    await expect(new BlePlxTransport().connect('AA', { timeoutMs: 1000, mtu: 185 })).rejects.toMatchObject({ code: 'service_not_found' });
    expect(native.cancelled).toBe(1);
  });

  it('maps native error codes', async () => {
    native.connectError = { errorCode: 102, reason: 'off' };
    await expect(new BlePlxTransport().connect('AA', { timeoutMs: 1000, mtu: 185 })).rejects.toMatchObject({ code: 'bluetooth_off' });
    native.connectError = { errorCode: 3, reason: 'timeout' };
    await expect(new BlePlxTransport().connect('AA', { timeoutMs: 1000, mtu: 185 })).rejects.toMatchObject({ code: 'connect_timeout' });
    native.connectError = { errorCode: 999, reason: '?' };
    await expect(new BlePlxTransport().connect('AA', { timeoutMs: 1000, mtu: 185 })).rejects.toMatchObject({ code: 'connect_failed' });
  });

  it('uses write-without-response when the characteristic supports it', async () => {
    native.chars = goodChars().map((c) => (c.uuid.toLowerCase() === BLE_PROTOCOL.rxCharacteristicUuid ? { ...c, isWritableWithoutResponse: true } : c));
    const c = await new BlePlxTransport().connect('AA', { timeoutMs: 1000, mtu: 185 });
    await c.write(Uint8Array.from([0x0a]));
    expect(native.writes).toEqual(['nr:Cg==']);
  });
});
