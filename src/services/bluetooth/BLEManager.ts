import { BLE_PROTOCOL } from '@/config/ble';
import type { ParameterId } from '@/config/parameters';
import type { Repositories } from '@/database/repositories';
import type { Calibration, TestResult } from '@/types/domain';
import { nowIso } from '@/utils/id';

import { DeviceSession } from './BLEConnection';
import { toNewTestResult, type DeviceMessage } from './BLEDataParser';
import { BleError, type AdapterState, type BleTransport, type ScannedDevice, type Unsubscribe } from './BLETypes';
import { resolveCalibrationId, SyncService, type SyncReport } from './SyncService';

export type ConnectionState = 'idle' | 'scanning' | 'connecting' | 'connected' | 'reconnecting' | 'disconnected';
export type PermissionOutcome = 'granted' | 'denied' | 'blocked';
export type DeviceStatus = Extract<DeviceMessage, { type: 'status' }>;

export interface PendingMeasurement {
  parameter: ParameterId;
  sampleId: string | null;
  startedAt: string;
}

export interface BleSnapshot {
  state: ConnectionState;
  adapter: AdapterState;
  scanResults: ScannedDevice[];
  connectedBleId: string | null;
  deviceStatus: DeviceStatus | null;
  lastError: BleError | null;
  lastSync: SyncReport | null;
  pendingMeasurement: PendingMeasurement | null;
  measurementStage: string | null;
  reconnectAttempt: number;
  protocolErrors: number;
}

export interface BleManagerDeps {
  transport: BleTransport;
  repos: Repositories;
  ensurePermissions: () => Promise<PermissionOutcome>;
  sleep?: (ms: number) => Promise<void>;
  autoSync?: () => Promise<boolean>;
  autoReconnect?: () => Promise<boolean>;
}

/** Identifies ESP32-A by advertised service UUID or name prefix (config only). */
export function isSipSureDevice(d: ScannedDevice): boolean {
  return (
    d.serviceUuids.some((u) => u.toLowerCase() === BLE_PROTOCOL.serviceUuid) ||
    [BLE_PROTOCOL.deviceNamePrefix, ...BLE_PROTOCOL.legacyDeviceNamePrefixes].some((p) => d.name?.startsWith(p) ?? false)
  );
}

/**
 * Orchestrates scan → connect → hello/status → set_time → sync, live measurements, calibration upload,
 * auto-reconnect with exponential backoff, and recovery of measurements interrupted by a phone-side disconnect.
 * A phone disconnect never sends a cancel; the device finishes and stores the result, which is synced on reconnect.
 */
export class BLEManager {
  private snap: BleSnapshot = {
    state: 'idle',
    adapter: 'Unknown',
    scanResults: [],
    connectedBleId: null,
    deviceStatus: null,
    lastError: null,
    lastSync: null,
    pendingMeasurement: null,
    measurementStage: null,
    reconnectAttempt: 0,
    protocolErrors: 0,
  };
  private session: DeviceSession | null = null;
  private readonly listeners = new Set<(s: BleSnapshot) => void>();
  private readonly resultListeners = new Set<(r: TestResult, source: 'live' | 'sync') => void>();
  private readonly sync: SyncService;
  private readonly sleep: (ms: number) => Promise<void>;
  private userDisconnect = false;
  private stateUnsub: Unsubscribe | null = null;
  private liveWaiter: ((r: TestResult) => void) | null = null;

  constructor(private readonly deps: BleManagerDeps) {
    this.sync = new SyncService(deps.repos);
    this.sleep = deps.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get snapshot(): BleSnapshot {
    return this.snap;
  }

  subscribe(cb: (s: BleSnapshot) => void): Unsubscribe {
    this.listeners.add(cb);
    cb(this.snap);
    return () => this.listeners.delete(cb);
  }

  onResult(cb: (r: TestResult, source: 'live' | 'sync') => void): Unsubscribe {
    this.resultListeners.add(cb);
    return () => this.resultListeners.delete(cb);
  }

  private set(patch: Partial<BleSnapshot>): void {
    this.snap = { ...this.snap, ...patch };
    for (const l of this.listeners) l(this.snap);
  }

  private fail(e: unknown): BleError {
    const err = e instanceof BleError ? e : new BleError('unknown', e instanceof Error ? e.message : String(e));
    this.set({ lastError: err });
    return err;
  }

  async init(): Promise<void> {
    this.set({ adapter: await this.deps.transport.getState() });
    this.stateUnsub?.();
    this.stateUnsub = this.deps.transport.onStateChange((adapter) => this.set({ adapter }));
  }

  private async preflight(): Promise<void> {
    const perm = await this.deps.ensurePermissions();
    if (perm !== 'granted') throw new BleError('permission_denied', perm === 'blocked' ? 'Bluetooth permission permanently denied' : 'Bluetooth permission denied');
    const adapter = await this.deps.transport.getState();
    this.set({ adapter });
    if (adapter === 'PoweredOff') throw new BleError('bluetooth_off', 'Bluetooth is turned off');
    if (adapter === 'Unauthorized') throw new BleError('unauthorized', 'Bluetooth access not authorised');
    if (adapter === 'Unsupported') throw new BleError('unsupported', 'Bluetooth LE not supported on this phone');
  }

  async startScan(): Promise<void> {
    try {
      await this.preflight();
    } catch (e) {
      throw this.fail(e);
    }
    this.set({ state: 'scanning', scanResults: [], lastError: null });
    await this.deps.transport.startScan(
      (d) => {
        if (!isSipSureDevice(d)) return;
        const others = this.snap.scanResults.filter((x) => x.id !== d.id);
        this.set({ scanResults: [...others, d].sort((a, b) => (b.rssi ?? -999) - (a.rssi ?? -999)) });
      },
      (e) => {
        this.fail(e);
        this.set({ state: this.session ? 'connected' : 'idle' });
      },
    );
  }

  async stopScan(): Promise<void> {
    await this.deps.transport.stopScan();
    if (this.snap.state === 'scanning') this.set({ state: this.session ? 'connected' : 'idle' });
  }

  async connect(bleId: string): Promise<DeviceStatus> {
    try {
      await this.preflight();
    } catch (e) {
      throw this.fail(e);
    }
    if (this.snap.state === 'scanning') await this.deps.transport.stopScan();
    this.userDisconnect = false;
    this.set({ state: 'connecting', lastError: null });
    try {
      return await this.openSession(bleId);
    } catch (e) {
      this.set({ state: 'disconnected' });
      throw this.fail(e);
    }
  }

  private async openSession(bleId: string): Promise<DeviceStatus> {
    const conn = await this.deps.transport.connect(bleId, { timeoutMs: BLE_PROTOCOL.timeouts.connectMs, mtu: BLE_PROTOCOL.requestedMtu });
    const session = new DeviceSession(conn);
    this.session = session;
    session.on('disconnect', (e) => void this.handleDisconnect(e));
    session.on('progress', (m) => this.set({ measurementStage: m.stage }));
    session.on('status', (m) => this.set({ deviceStatus: m }));
    session.on('protocolError', (detail) => {
      this.set({ protocolErrors: session.protocolErrors });
      this.fail(new BleError('protocol_error', detail));
    });
    session.on('result', (m) => void this.handleLiveResult(m));
    try {
      await session.request({ cmd: 'hello' });
      const status = await session.request({ cmd: 'get_status' });
      if (status.type !== 'status') throw new BleError('protocol_error', 'Expected status');
      // D15: device clock is set from the phone at pairing/connection.
      await session.request({ cmd: 'set_time', epoch_ms: Date.now(), tz_offset_min: -new Date().getTimezoneOffset() });
      await this.deps.repos.devices.upsert({
        deviceId: status.device_id,
        deviceName: status.name,
        firmwareVersion: status.firmware,
        connectionMetadata: { bleId, mtu: conn.mtu, protocol: BLE_PROTOCOL.status, protocolVersion: BLE_PROTOCOL.protocolVersion },
      });
      await this.deps.repos.devices.markConnected(status.device_id);
      this.set({ state: 'connected', connectedBleId: bleId, deviceStatus: status, reconnectAttempt: 0, measurementStage: null });
      if ((await this.deps.autoSync?.()) ?? true) await this.syncNow().catch((e: unknown) => this.fail(e));
      return status;
    } catch (e) {
      this.session = null;
      await session.close().catch(() => undefined);
      throw e;
    }
  }

  private async handleDisconnect(e: BleError | null): Promise<void> {
    this.session = null;
    if (this.userDisconnect) {
      this.set({ state: 'disconnected', connectedBleId: null, measurementStage: null });
      return;
    }
    const bleId = this.snap.connectedBleId;
    const lost = e ?? new BleError('disconnected', 'Connection lost');
    // Reflect the drop immediately, before any async preference read.
    this.set({ state: bleId ? 'reconnecting' : 'disconnected', lastError: lost });
    if (!bleId || !((await this.deps.autoReconnect?.()) ?? true)) {
      this.set({ state: 'disconnected', lastError: lost, measurementStage: null });
      return;
    }
    const { maxAttempts, baseDelayMs, maxDelayMs } = BLE_PROTOCOL.reconnect;
    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      this.set({ reconnectAttempt: attempt });
      await this.sleep(Math.min(maxDelayMs, baseDelayMs * 2 ** (attempt - 1)));
      if (this.userDisconnect) return this.set({ state: 'disconnected' });
      try {
        await this.openSession(bleId);
        return;
      } catch (err) {
        this.fail(err);
      }
    }
    this.set({ state: 'disconnected', connectedBleId: null });
  }

  async disconnect(): Promise<void> {
    this.userDisconnect = true;
    const s = this.session;
    this.session = null;
    if (s) await s.close();
    this.set({ state: 'disconnected', connectedBleId: null, measurementStage: null });
  }

  private requireSession(): DeviceSession {
    if (!this.session?.isOpen) throw this.fail(new BleError('disconnected', 'No device connected'));
    return this.session;
  }

  async refreshStatus(): Promise<DeviceStatus> {
    const m = await this.requireSession().request({ cmd: 'get_status' });
    if (m.type !== 'status') throw this.fail(new BleError('protocol_error', 'Expected status'));
    this.set({ deviceStatus: m });
    return m;
  }

  /** Links a synced result to the sample of a measurement interrupted by disconnect. */
  private linkPending = (raw: unknown): string | null => {
    const p = this.snap.pendingMeasurement;
    if (!p || typeof raw !== 'object' || raw === null) return null;
    const r = raw as { parameter?: unknown; timestamp?: unknown };
    if (r.parameter !== p.parameter) return null;
    if (typeof r.timestamp === 'string' && Date.parse(r.timestamp) < Date.parse(p.startedAt) - 60_000) return null;
    return p.sampleId;
  };

  async syncNow(): Promise<SyncReport> {
    const session = this.requireSession();
    const deviceId = this.snap.deviceStatus?.device_id;
    if (!deviceId) throw this.fail(new BleError('protocol_error', 'Device identity unknown'));
    const pending = this.snap.pendingMeasurement;
    const report = await this.sync.syncStoredResults(session, deviceId, { linkSample: this.linkPending });
    this.set({ lastSync: report });
    for (const r of report.insertedResults) {
      if (pending && r.parameter === pending.parameter && r.sampleId === pending.sampleId) {
        this.set({ pendingMeasurement: null, measurementStage: null });
        this.liveWaiter?.(r);
      }
      for (const l of this.resultListeners) l(r, 'sync');
    }
    return report;
  }

  private async handleLiveResult(m: Extract<DeviceMessage, { type: 'result' }>): Promise<void> {
    const deviceId = this.snap.deviceStatus?.device_id;
    if (!deviceId) return;
    const p = this.snap.pendingMeasurement;
    const mapped = toNewTestResult(m.result, {
      deviceId,
      calibrationId: await resolveCalibrationId(this.deps.repos, m.result),
      phoneTimestamp: nowIso(),
      sampleId: p && p.parameter === m.result.parameter ? p.sampleId : null,
    });
    if (!mapped.ok) {
      this.fail(new BleError('protocol_error', `Invalid result: ${mapped.detail}`));
      return;
    }
    const out = await this.deps.repos.results.insert(mapped.value);
    const stored = out.inserted ? out.result : await this.deps.repos.results.getById(out.duplicateOf);
    if (!stored) return;
    if (p && p.parameter === stored.parameter) {
      this.set({ pendingMeasurement: null, measurementStage: null });
      this.liveWaiter?.(stored);
    }
    if (out.inserted) for (const l of this.resultListeners) l(stored, 'live');
  }

  /**
   * Starts a measurement on ESP32-A and resolves with the stored result.
   * If the link drops, rejects with `disconnected` but keeps `pendingMeasurement`; the result is
   * recovered by sync after reconnection and delivered via `onResult(…, 'sync')`.
   */
  async measure(parameter: ParameterId, sampleId: string | null): Promise<TestResult> {
    const session = this.requireSession();
    if (this.snap.pendingMeasurement) throw this.fail(new BleError('busy', 'A measurement is already in progress'));
    this.set({ pendingMeasurement: { parameter, sampleId, startedAt: nowIso() }, measurementStage: 'requested', lastError: null });
    let timer: ReturnType<typeof setTimeout> | undefined;
    const resultPromise = new Promise<TestResult>((resolve, reject) => {
      timer = setTimeout(() => {
        this.liveWaiter = null;
        reject(new BleError('command_timeout', 'Measurement result not received in time'));
      }, BLE_PROTOCOL.timeouts.measurementMs);
      this.liveWaiter = (r) => {
        clearTimeout(timer);
        this.liveWaiter = null;
        resolve(r);
      };
      session.on('disconnect', () => {
        clearTimeout(timer);
        this.liveWaiter = null;
        reject(new BleError('disconnected', 'Connection lost during measurement — the device continues and the result will be retrieved on reconnect'));
      });
    });
    try {
      await session.request({ cmd: 'start_measurement', parameter });
    } catch (e) {
      if (!(e instanceof BleError && e.code === 'disconnected')) this.set({ pendingMeasurement: null, measurementStage: null });
      this.liveWaiter = null;
      clearTimeout(timer);
      resultPromise.catch(() => undefined);
      throw this.fail(e);
    }
    try {
      return await resultPromise;
    } catch (e) {
      throw this.fail(e);
    }
  }

  /** Clears a pending measurement the user abandons (does not contact the device). */
  clearPendingMeasurement(): void {
    this.set({ pendingMeasurement: null, measurementStage: null });
  }

  /** Sends slope/intercept to ESP32-A (feature list: fitted in app, sent over BLE). */
  async sendCalibration(cal: Calibration): Promise<void> {
    const session = this.requireSession();
    try {
      await session.request({ cmd: 'set_calibration', parameter: cal.parameter, slope: cal.slope, intercept: cal.intercept, version: cal.calibrationVersion });
    } catch (e) {
      throw this.fail(e);
    }
    await this.deps.repos.calibrations.markSentToDevice(cal.calibrationId);
  }

  dispose(): void {
    this.stateUnsub?.();
    this.listeners.clear();
    this.resultListeners.clear();
  }
}
