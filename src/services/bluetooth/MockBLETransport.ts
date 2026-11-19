/**
 * ⚠ MOCK — simulated ESP32-A speaking the PROVISIONAL protocol. For automated tests and explicit
 * development mode only; never selected in release builds (see transportFactory.ts). Results produced
 * here are simulated and must never be reported as hardware results.
 */
import { BLE_PROTOCOL } from '@/config/ble';
import type { ParameterId } from '@/config/parameters';
import { utf8Encode } from '@/utils/codec';

import { FrameAssembler } from './BLEFraming';
import { BleError, type AdapterState, type BleConnection, type BleTransport, type ScannedDevice, type Unsubscribe } from './BLETypes';

export interface MockStoredResult {
  device_test_id: string;
  parameter: ParameterId;
  idark: number | null;
  iblank: number | null;
  isample: number | null;
  absorbance: number | null;
  concentration: number | null;
  camera?: unknown;
  retest?: boolean;
  warnings?: string[];
  calibration?: { version: number | null; slope?: number; intercept?: number } | null;
  firmware?: string;
  timestamp?: string;
}

export interface MockDeviceOptions {
  bleId?: string;
  deviceId?: string;
  name?: string;
  firmware?: string;
  rssi?: number;
  advertiseService?: boolean;
  /** Raw intensities the simulated photometer will report, per parameter. */
  raw?: Partial<Record<ParameterId, { idark: number; iblank: number; isample: number }>>;
  measurementMs?: number;
  selfTest?: Record<string, 'pass' | 'fail' | 'unknown'>;
}

interface Calib {
  slope: number;
  intercept: number;
  version: number;
}

export class MockESP32 {
  readonly bleId: string;
  readonly deviceId: string;
  name: string;
  firmware: string;
  rssi: number;
  advertiseService: boolean;
  stored: MockStoredResult[] = [];
  calibrations: Partial<Record<ParameterId, Calib>> = {};
  clockOffsetMs: number | null = null;
  busy = false;
  measurementMs: number;
  raw: NonNullable<MockDeviceOptions['raw']>;
  selfTest: Record<string, 'pass' | 'fail' | 'unknown'>;
  received: Record<string, unknown>[] = [];
  private nextTest = 1;
  /** Test hooks */
  dropResponsesFor = new Set<string>();
  respondWithError: Partial<Record<string, string>> = {};

  constructor(o: MockDeviceOptions = {}) {
    this.bleId = o.bleId ?? 'AA:BB:CC:DD:EE:01';
    this.deviceId = o.deviceId ?? 'ESP32A-0001';
    this.name = o.name ?? `${BLE_PROTOCOL.deviceNamePrefix}-A1`;
    this.firmware = o.firmware ?? '0.9.0-mock';
    this.rssi = o.rssi ?? -60;
    this.advertiseService = o.advertiseService ?? true;
    this.measurementMs = o.measurementMs ?? 50;
    this.raw = o.raw ?? {};
    this.selfTest = o.selfTest ?? { green_led: 'pass', backlight_led: 'pass', photodiode: 'pass', camera_link: 'pass', supply_voltage: 'pass' };
  }

  addStoredResult(r: Partial<MockStoredResult> & { parameter: ParameterId }): MockStoredResult {
    const full: MockStoredResult = {
      device_test_id: `T-${String(this.nextTest++).padStart(5, '0')}`,
      idark: 100,
      iblank: 20000,
      isample: 12000,
      absorbance: null,
      concentration: null,
      retest: false,
      warnings: [],
      firmware: this.firmware,
      timestamp: new Date().toISOString(),
      calibration: null,
      camera: { status: 'agree', rgb: { r: 180, g: 90, b: 160 } },
      ...r,
    };
    this.stored.push(full);
    return full;
  }

  /** Simulated firmware maths (same published formulas) — used only to make mock payloads self-consistent. */
  simulate(parameter: ParameterId): MockStoredResult {
    const raw = this.raw[parameter] ?? { idark: 120, iblank: 21000, isample: 14000 };
    const a = Math.log10((raw.iblank - raw.idark) / (raw.isample - raw.idark));
    const cal = this.calibrations[parameter];
    const conc = cal ? (a - cal.intercept) / cal.slope : null;
    return this.addStoredResult({
      parameter,
      ...raw,
      absorbance: Number.isFinite(a) ? a : null,
      concentration: conc !== null && Number.isFinite(conc) ? conc : null,
      warnings: cal ? [] : ['no_calibration'],
      calibration: cal ? { version: cal.version, slope: cal.slope, intercept: cal.intercept } : null,
    });
  }
}

class MockConnection implements BleConnection {
  private notify = new Set<(b: Uint8Array) => void>();
  private disc = new Set<(e: BleError | null) => void>();
  private assembler = new FrameAssembler();
  open = true;
  /** Bytes per notification; small values exercise fragmentation. */
  chunkSize: number;

  constructor(
    readonly device: MockESP32,
    readonly mtu: number,
    private readonly transport: MockBLETransport,
  ) {
    this.chunkSize = mtu - 3;
  }

  get deviceId() {
    return this.device.bleId;
  }
  get name() {
    return this.device.name;
  }

  onNotify(cb: (b: Uint8Array) => void): Unsubscribe {
    this.notify.add(cb);
    return () => this.notify.delete(cb);
  }
  onDisconnect(cb: (e: BleError | null) => void): Unsubscribe {
    this.disc.add(cb);
    return () => this.disc.delete(cb);
  }

  async write(bytes: Uint8Array): Promise<void> {
    if (!this.open) throw new BleError('write_failed', 'not connected');
    if (bytes.length > this.mtu - 3) throw new BleError('write_failed', `write of ${bytes.length} exceeds MTU payload`);
    for (const ev of this.assembler.push(bytes)) if (ev.kind === 'frame') this.handle(ev.text);
  }

  async disconnect(): Promise<void> {
    this.drop(null);
  }

  /** Simulates link loss (out of range, device power-off). */
  drop(error: BleError | null = new BleError('disconnected', 'link lost')): void {
    if (!this.open) return;
    this.open = false;
    this.transport.connections.delete(this);
    for (const cb of this.disc) cb(error);
  }

  /** Sends raw bytes to the phone, fragmented by chunkSize. */
  sendRaw(bytes: Uint8Array): void {
    for (let i = 0; i < bytes.length; i += this.chunkSize) {
      const chunk = bytes.slice(i, i + this.chunkSize);
      queueMicrotask(() => this.open && this.notify.forEach((cb) => cb(chunk)));
    }
  }

  send(obj: Record<string, unknown>): void {
    this.sendRaw(utf8Encode(`${JSON.stringify({ v: BLE_PROTOCOL.protocolVersion, ...obj })}\n`));
  }

  private handle(text: string): void {
    const d = this.device;
    let msg: Record<string, unknown>;
    try {
      msg = JSON.parse(text) as Record<string, unknown>;
    } catch {
      this.send({ type: 'error', id: null, code: 'invalid_args', message: 'bad json' });
      return;
    }
    d.received.push(msg);
    const id = msg.id as number;
    const cmd = String(msg.cmd);
    if (d.dropResponsesFor.has(cmd)) return;
    const forcedError = d.respondWithError[cmd];
    if (forcedError) return this.send({ type: 'error', id, code: forcedError, message: forcedError });
    switch (cmd) {
      case 'hello':
        return this.send({ type: 'ack', id, ok: true });
      case 'get_status':
        return this.send({
          type: 'status',
          id,
          device_id: d.deviceId,
          name: d.name,
          firmware: d.firmware,
          busy: d.busy,
          battery: null,
          self_test: d.selfTest,
          stored_results: d.stored.length,
          calibrations: Object.fromEntries(
            Object.entries(d.calibrations).map(([k, c]) => [k, { version: c.version, slope: c.slope, intercept: c.intercept }]),
          ),
        });
      case 'set_time':
        d.clockOffsetMs = Number(msg.epoch_ms) - Date.now();
        return this.send({ type: 'ack', id, ok: true });
      case 'set_calibration': {
        const slope = Number(msg.slope);
        if (!Number.isFinite(slope) || slope === 0) return this.send({ type: 'error', id, code: 'invalid_args', message: 'slope' });
        d.calibrations[msg.parameter as ParameterId] = { slope, intercept: Number(msg.intercept), version: Number(msg.version) };
        return this.send({ type: 'ack', id, ok: true });
      }
      case 'start_measurement': {
        if (d.busy) return this.send({ type: 'error', id, code: 'busy', message: 'measurement running' });
        d.busy = true;
        this.send({ type: 'ack', id, ok: true });
        const parameter = msg.parameter as ParameterId;
        const stages = ['dark', 'blank', 'sample', 'camera'];
        stages.forEach((stage, i) =>
          setTimeout(() => this.transport.broadcast(d, { type: 'progress', stage }), ((i + 1) * d.measurementMs) / (stages.length + 1)),
        );
        // Measurement runs on the device regardless of the phone link (specification §7).
        setTimeout(() => {
          const r = d.simulate(parameter);
          d.busy = false;
          this.transport.broadcast(d, { type: 'result', id, result: r });
        }, d.measurementMs);
        return;
      }
      case 'get_results': {
        const after = (msg.after as string | null) ?? null;
        const limit = Math.max(1, Number(msg.limit) || 20);
        const start = after === null ? 0 : d.stored.findIndex((r) => r.device_test_id === after) + 1;
        const slice = d.stored.slice(start, start + limit);
        return this.send({ type: 'results_batch', id, results: slice, more: start + limit < d.stored.length });
      }
      default:
        return this.send({ type: 'error', id, code: 'unknown_command', message: cmd });
    }
  }
}

export class MockBLETransport implements BleTransport {
  readonly kind = 'mock' as const;
  adapterState: AdapterState = 'PoweredOn';
  devices: MockESP32[] = [];
  /** Extra non-AquaSense devices seen while scanning. */
  otherDevices: ScannedDevice[] = [];
  connections = new Set<MockConnection>();
  connectFailures = 0;
  failConnectWith: BleError | null = null;
  negotiatedMtu = 185;
  chunkSize: number | null = null;
  private stateCbs = new Set<(s: AdapterState) => void>();
  private scanning = false;

  constructor(devices: MockESP32[] = [new MockESP32()]) {
    this.devices = devices;
  }

  setAdapterState(s: AdapterState): void {
    this.adapterState = s;
    this.stateCbs.forEach((cb) => cb(s));
    if (s !== 'PoweredOn') for (const c of [...this.connections]) c.drop(new BleError('bluetooth_off', 'Bluetooth turned off'));
  }

  async getState(): Promise<AdapterState> {
    return this.adapterState;
  }

  onStateChange(cb: (s: AdapterState) => void): Unsubscribe {
    this.stateCbs.add(cb);
    return () => this.stateCbs.delete(cb);
  }

  async startScan(onDevice: (d: ScannedDevice) => void, onError: (e: BleError) => void): Promise<void> {
    if (this.adapterState !== 'PoweredOn') return onError(new BleError('bluetooth_off'));
    this.scanning = true;
    queueMicrotask(() => {
      if (!this.scanning) return;
      for (const o of this.otherDevices) onDevice(o);
      for (const d of this.devices)
        onDevice({ id: d.bleId, name: d.name, rssi: d.rssi, serviceUuids: d.advertiseService ? [BLE_PROTOCOL.serviceUuid] : [] });
    });
  }

  async stopScan(): Promise<void> {
    this.scanning = false;
  }

  async connect(bleId: string, opts: { timeoutMs: number; mtu: number }): Promise<BleConnection> {
    if (this.adapterState !== 'PoweredOn') throw new BleError('bluetooth_off');
    if (this.failConnectWith) throw this.failConnectWith;
    if (this.connectFailures > 0) {
      this.connectFailures--;
      throw new BleError('connect_failed', 'simulated connect failure');
    }
    const d = this.devices.find((x) => x.bleId === bleId);
    if (!d) throw new BleError('device_not_found', `No device ${bleId}`);
    const c = new MockConnection(d, Math.min(opts.mtu, this.negotiatedMtu), this);
    if (this.chunkSize) c.chunkSize = this.chunkSize;
    this.connections.add(c);
    return c;
  }

  connectionFor(d: MockESP32): MockConnection | undefined {
    return [...this.connections].find((c) => c.device === d);
  }

  broadcast(d: MockESP32, obj: Record<string, unknown>): void {
    this.connectionFor(d)?.send(obj);
  }

  /** Utility to inject raw notification bytes (corrupt/partial packets). */
  injectRaw(d: MockESP32, text: string | Uint8Array): void {
    this.connectionFor(d)?.sendRaw(typeof text === 'string' ? utf8Encode(text) : text);
  }
}

