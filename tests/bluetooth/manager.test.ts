/** All tests here are MOCK-BLE (simulated ESP32-A). They are not hardware results. */
import type { Repositories } from '@/database/repositories';
import { BLEManager, type PermissionOutcome } from '@/services/bluetooth/BLEManager';
import { BleError } from '@/services/bluetooth/BLETypes';
import { MockBLETransport, MockESP32 } from '@/services/bluetooth/MockBLETransport';

import { createTestRepos } from '../helpers/db';

let repos: Repositories;
let dev: MockESP32;
let transport: MockBLETransport;
let perm: PermissionOutcome;
let mgr: BLEManager;

const flush = () => new Promise((r) => setTimeout(r, 0));
const waitFor = async (pred: () => boolean, ms = 2000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
};

beforeEach(async () => {
  repos = await createTestRepos();
  dev = new MockESP32({ measurementMs: 40, raw: { cr6: { idark: 100, iblank: 10100, isample: 1100 } } });
  transport = new MockBLETransport([dev]);
  perm = 'granted';
  mgr = new BLEManager({ transport, repos, ensurePermissions: async () => perm, sleep: async () => undefined });
  await mgr.init();
});
afterEach(async () => {
  mgr.dispose();
  await repos.db.close();
});

describe('scan (MOCK-BLE)', () => {
  it('lists only AquaSense devices (service UUID or name prefix)', async () => {
    transport.otherDevices = [{ id: 'X', name: 'Headphones', rssi: -40, serviceUuids: [] }];
    const byName = new MockESP32({ bleId: 'B2', name: 'AquaSense-B', advertiseService: false, rssi: -80 });
    transport.devices.push(byName);
    await mgr.startScan();
    await flush();
    expect(mgr.snapshot.scanResults.map((d) => d.id)).toEqual([dev.bleId, 'B2']);
    expect(mgr.snapshot.state).toBe('scanning');
    await mgr.stopScan();
    expect(mgr.snapshot.state).toBe('idle');
  });

  it.each([
    ['denied', 'permission_denied'],
    ['blocked', 'permission_denied'],
  ] as const)('permission %s → %s, no scan started', async (p, code) => {
    perm = p;
    await expect(mgr.startScan()).rejects.toMatchObject({ code });
    expect(mgr.snapshot.state).toBe('idle');
    expect(mgr.snapshot.lastError?.code).toBe(code);
  });

  it('bluetooth off / unsupported', async () => {
    transport.setAdapterState('PoweredOff');
    await expect(mgr.startScan()).rejects.toMatchObject({ code: 'bluetooth_off' });
    transport.setAdapterState('Unsupported');
    await expect(mgr.connect(dev.bleId)).rejects.toMatchObject({ code: 'unsupported' });
  });
});

describe('connect (MOCK-BLE)', () => {
  it('hello → status → set_time, persists device, syncs', async () => {
    dev.addStoredResult({ parameter: 'nitrite', concentration: 0.1, absorbance: 0.12 });
    const status = await mgr.connect(dev.bleId);
    expect(status.device_id).toBe('ESP32A-0001');
    expect(mgr.snapshot.state).toBe('connected');
    expect(dev.received.map((m) => m.cmd).slice(0, 4)).toEqual(['hello', 'get_status', 'set_time', 'get_results']);
    expect(dev.clockOffsetMs).not.toBeNull();
    expect(Math.abs(dev.clockOffsetMs ?? 1e9)).toBeLessThan(1000);
    expect(await repos.devices.getById('ESP32A-0001')).toMatchObject({ firmwareVersion: '0.9.0-mock' });
    expect(await repos.results.count()).toBe(1);
  });

  it('device not found and connect timeout leave state disconnected', async () => {
    await expect(mgr.connect('nope')).rejects.toMatchObject({ code: 'device_not_found' });
    expect(mgr.snapshot.state).toBe('disconnected');
    transport.failConnectWith = new BleError('connect_timeout');
    await expect(mgr.connect(dev.bleId)).rejects.toMatchObject({ code: 'connect_timeout' });
  });

  it('command timeout when device does not answer', async () => {
    jest.useFakeTimers({ doNotFake: ['queueMicrotask', 'nextTick', 'setImmediate'] });
    dev.dropResponsesFor.add('hello');
    const p = mgr.connect(dev.bleId);
    const assertion = expect(p).rejects.toMatchObject({ code: 'command_timeout' });
    await jest.advanceTimersByTimeAsync(9000);
    await assertion;
    jest.useRealTimers();
    expect(transport.connections.size).toBe(0);
  });

  it('works with tiny MTU (heavy fragmentation both directions)', async () => {
    transport.negotiatedMtu = 23;
    transport.chunkSize = 7;
    await mgr.connect(dev.bleId);
    expect(mgr.snapshot.state).toBe('connected');
  });
});

describe('measurement (MOCK-BLE)', () => {
  it('runs a measurement and stores the result linked to the sample', async () => {
    const s = await repos.samples.create({ sampleName: 'Tap', sourceType: 'tap', notes: null, photoPath: null, location: null });
    await mgr.connect(dev.bleId);
    const stages: string[] = [];
    mgr.subscribe((snap) => snap.measurementStage && stages.push(snap.measurementStage));
    const r = await mgr.measure('cr6', s.sampleId);
    expect(r.absorbance).toBeCloseTo(1, 10);
    expect(r.concentration).toBeNull(); // no calibration on device → never fabricated
    expect(r.measurementQualityStatus).toBe('invalid');
    expect(r.deviceWarnings).toContain('no_calibration');
    expect(r.sampleId).toBe(s.sampleId);
    expect(stages).toEqual(expect.arrayContaining(['requested', 'dark', 'sample']));
    expect(mgr.snapshot.pendingMeasurement).toBeNull();
  });

  it('calibration sent over BLE is used by the device and linked locally', async () => {
    await mgr.connect(dev.bleId);
    const cal = await repos.calibrations.saveNewVersion({ parameter: 'cr6', slope: 0.8, intercept: 0.05, rSquared: 1, lod: null, loq: null, standardsUsed: [], status: 'active' });
    await mgr.sendCalibration(cal);
    expect((await repos.calibrations.getById(cal.calibrationId))?.sentToDeviceAt).not.toBeNull();
    const r = await mgr.measure('cr6', null);
    expect(r.concentration).toBeCloseTo((1 - 0.05) / 0.8, 10);
    expect(r.calibrationId).toBe(cal.calibrationId);
    expect(r.measurementQualityStatus).toBe('ok');
  });

  it('device busy error surfaces as busy', async () => {
    await mgr.connect(dev.bleId);
    dev.busy = true;
    await expect(mgr.measure('cr6', null)).rejects.toMatchObject({ code: 'busy' });
    expect(mgr.snapshot.pendingMeasurement).toBeNull();
  });

  it('rejects a second concurrent measurement', async () => {
    await mgr.connect(dev.bleId);
    const first = mgr.measure('cr6', null);
    await expect(mgr.measure('cr6', null)).rejects.toMatchObject({ code: 'busy' });
    await first;
  });

  it('disconnect mid-measurement: device continues; result recovered on reconnect without duplicates', async () => {
    const s = await repos.samples.create({ sampleName: 'River', sourceType: 'river', notes: null, photoPath: null, location: null });
    await mgr.connect(dev.bleId);
    const recovered: string[] = [];
    mgr.onResult((r, src) => recovered.push(`${src}:${r.sampleId}`));
    dev.measurementMs = 150;
    // Hold reconnect until the device has finished measuring.
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    (mgr as unknown as { sleep: () => Promise<void> }).sleep = () => gate;
    const p = mgr.measure('cr6', s.sampleId);
    await waitFor(() => dev.busy);
    transport.connectionFor(dev)?.drop();
    await expect(p).rejects.toMatchObject({ code: 'disconnected' });
    expect(mgr.snapshot.state).toBe('reconnecting');
    expect(mgr.snapshot.pendingMeasurement?.sampleId).toBe(s.sampleId);
    await waitFor(() => !dev.busy);
    expect(dev.stored).toHaveLength(1);
    release();
    await waitFor(() => mgr.snapshot.state === 'connected');
    await waitFor(() => recovered.length === 1);
    expect(recovered).toEqual([`sync:${s.sampleId}`]);
    expect(mgr.snapshot.pendingMeasurement).toBeNull();
    expect(dev.received.some((m) => m.cmd === 'cancel')).toBe(false);
    await mgr.syncNow();
    expect(await repos.results.count()).toBe(1);
  });

  it('gives up reconnecting after max attempts', async () => {
    await mgr.connect(dev.bleId);
    transport.connectFailures = 100;
    transport.connectionFor(dev)?.drop();
    await waitFor(() => mgr.snapshot.state === 'disconnected');
    expect(mgr.snapshot.reconnectAttempt).toBe(6);
    expect(mgr.snapshot.connectedBleId).toBeNull();
  });

  it('reconnects after transient failures', async () => {
    await mgr.connect(dev.bleId);
    transport.connectFailures = 2;
    transport.connectionFor(dev)?.drop();
    await waitFor(() => mgr.snapshot.state === 'connected');
    expect(mgr.snapshot.reconnectAttempt).toBe(0);
  });

  it('user disconnect does not reconnect', async () => {
    await mgr.connect(dev.bleId);
    await mgr.disconnect();
    await flush();
    expect(mgr.snapshot.state).toBe('disconnected');
    expect(transport.connections.size).toBe(0);
    await expect(mgr.measure('cr6', null)).rejects.toMatchObject({ code: 'disconnected' });
  });

  it('bluetooth turned off while connected → reconnect attempts fail → disconnected', async () => {
    await mgr.connect(dev.bleId);
    transport.setAdapterState('PoweredOff');
    await waitFor(() => mgr.snapshot.state === 'disconnected');
    expect(mgr.snapshot.adapter).toBe('PoweredOff');
  });
});

describe('sync (MOCK-BLE, A16)', () => {
  it('paginates, persists cursor, skips duplicates, reports invalid records', async () => {
    for (let i = 0; i < 45; i++) dev.addStoredResult({ parameter: 'nitrite', concentration: 0.01 * i, absorbance: 0.01 * i });
    dev.stored[10] = { ...dev.stored[10]!, parameter: 'mercury' as never };
    await mgr.connect(dev.bleId);
    const rep = mgr.snapshot.lastSync!;
    expect(rep).toMatchObject({ received: 45, inserted: 44, duplicates: 0 });
    expect(rep.invalid).toHaveLength(1);
    expect((await repos.devices.getSyncMetadata(dev.deviceId)).lastSyncedDeviceResultId).toBe('T-00045');
    const again = await mgr.syncNow();
    expect(again).toMatchObject({ received: 0, inserted: 0 });
    // Device re-delivers already-synced results (cursor lost) → all detected as duplicates.
    await repos.devices.updateSyncMetadata({ deviceId: dev.deviceId, lastSyncTimestamp: null, lastSyncedDeviceResultId: null, pendingSyncRecords: 0 });
    const redo = await mgr.syncNow();
    expect(redo).toMatchObject({ received: 45, inserted: 0, duplicates: 44 });
    expect(await repos.results.count()).toBe(44);
  });

  it('duplicate live delivery is stored once', async () => {
    await mgr.connect(dev.bleId);
    const r = await mgr.measure('cr6', null);
    transport.broadcast(dev, { type: 'result', result: dev.stored[0] });
    await flush();
    await flush();
    expect(await repos.results.count()).toBe(1);
    expect(r.deviceTestId).toBe(dev.stored[0]?.device_test_id);
  });

  it('corrupt / partial packets are counted and do not break the session', async () => {
    await mgr.connect(dev.bleId);
    transport.injectRaw(dev, '{"v":1,"type":"ack"\n');
    transport.injectRaw(dev, Uint8Array.from([0xff, 0xfe, 0x0a]));
    transport.injectRaw(dev, '{"v":1,"type":"result","result":{"parameter":"cr6"}}\n');
    transport.injectRaw(dev, '{"partial":');
    await flush();
    await flush();
    // bad JSON, bad UTF-8, result missing required fields → 3; trailing partial frame stays pending.
    expect(mgr.snapshot.protocolErrors).toBe(3);
    expect(mgr.snapshot.lastError?.code).toBe('protocol_error');
    expect(await repos.results.count()).toBe(0);
    // The dangling partial frame is discarded after the stale gap and does not corrupt the next response.
    await new Promise((r) => setTimeout(r, 600));
    await expect(mgr.refreshStatus()).resolves.toMatchObject({ type: 'status' });
  });

  it('interrupted sync resumes from persisted cursor', async () => {
    for (let i = 0; i < 30; i++) dev.addStoredResult({ parameter: 'nitrite', concentration: 0.1, absorbance: 0.1 });
    let calls = 0;
    const orig = dev.respondWithError;
    dev.respondWithError = new Proxy(orig, {
      get: (t, k) => (k === 'get_results' && ++calls === 2 ? 'storage_error' : (t as Record<string | symbol, string | undefined>)[k]),
    });
    await mgr.connect(dev.bleId);
    expect(mgr.snapshot.lastError?.code).toBe('device_error');
    expect(await repos.results.count()).toBe(20);
    const rep = await mgr.syncNow();
    expect(rep.inserted).toBe(10);
    expect(await repos.results.count()).toBe(30);
  });
});
