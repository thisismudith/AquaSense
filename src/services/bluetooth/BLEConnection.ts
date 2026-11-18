import { BLE_PROTOCOL } from '@/config/ble';

import { parseDeviceFrame, type DeviceMessage } from './BLEDataParser';
import { encodeFrame, FrameAssembler } from './BLEFraming';
import { serializeCommand, type DeviceCommand } from './BLEProtocol';
import { BleError, type BleConnection, type Unsubscribe } from './BLETypes';

type Pending = { resolve: (m: DeviceMessage) => void; reject: (e: BleError) => void; timer: ReturnType<typeof setTimeout> };

export interface SessionEvents {
  status: (m: Extract<DeviceMessage, { type: 'status' }>) => void;
  result: (m: Extract<DeviceMessage, { type: 'result' }>) => void;
  progress: (m: Extract<DeviceMessage, { type: 'progress' }>) => void;
  protocolError: (detail: string) => void;
  disconnect: (e: BleError | null) => void;
}

/**
 * One live link to ESP32-A: framing, request/response matching by id, unsolicited events.
 * Writes are serialised. All pending requests reject with `disconnected` when the link drops.
 */
export class DeviceSession {
  private seq = 0;
  private readonly pending = new Map<number, Pending>();
  private readonly assembler = new FrameAssembler();
  private writeChain: Promise<void> = Promise.resolve();
  private readonly listeners: { [K in keyof SessionEvents]: Set<SessionEvents[K]> } = {
    status: new Set(),
    result: new Set(),
    progress: new Set(),
    protocolError: new Set(),
    disconnect: new Set(),
  };
  private readonly unsubs: Unsubscribe[] = [];
  private closed = false;
  protocolErrors = 0;

  constructor(readonly connection: BleConnection) {
    this.unsubs.push(connection.onNotify((b) => this.onBytes(b)));
    this.unsubs.push(connection.onDisconnect((e) => this.onDisconnected(e)));
  }

  get isOpen(): boolean {
    return !this.closed;
  }

  on<K extends keyof SessionEvents>(event: K, cb: SessionEvents[K]): Unsubscribe {
    this.listeners[event].add(cb);
    return () => this.listeners[event].delete(cb);
  }

  private emit<K extends keyof SessionEvents>(event: K, ...args: Parameters<SessionEvents[K]>): void {
    for (const cb of this.listeners[event]) (cb as (...a: Parameters<SessionEvents[K]>) => void)(...args);
  }

  request(command: DeviceCommand, timeoutMs: number = BLE_PROTOCOL.timeouts.commandMs): Promise<DeviceMessage> {
    if (this.closed) return Promise.reject(new BleError('disconnected', 'Device is not connected'));
    const id = ++this.seq;
    const text = serializeCommand(id, command);
    return new Promise<DeviceMessage>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new BleError('command_timeout', `No response to ${command.cmd} within ${timeoutMs} ms`));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      this.writeChain = this.writeChain
        .then(async () => {
          for (const chunk of encodeFrame(text, this.connection.mtu)) await this.connection.write(chunk);
        })
        .catch((e: unknown) => {
          const p = this.pending.get(id);
          if (p) {
            clearTimeout(p.timer);
            this.pending.delete(id);
            p.reject(e instanceof BleError ? e : new BleError('write_failed', e instanceof Error ? e.message : String(e)));
          }
        });
    });
  }

  private onBytes(bytes: Uint8Array): void {
    for (const ev of this.assembler.push(bytes)) {
      if (ev.kind === 'corrupt') {
        this.protocolErrors++;
        this.emit('protocolError', `corrupt frame: ${ev.reason}`);
        continue;
      }
      const parsed = parseDeviceFrame(ev.text);
      if (!parsed.ok) {
        this.protocolErrors++;
        this.emit('protocolError', `${parsed.error}: ${parsed.detail}`);
        continue;
      }
      this.dispatch(parsed.message);
    }
  }

  private settle(id: number | null | undefined, fn: (p: Pending) => void): boolean {
    if (id === null || id === undefined) return false;
    const p = this.pending.get(id);
    if (!p) return false;
    clearTimeout(p.timer);
    this.pending.delete(id);
    fn(p);
    return true;
  }

  private dispatch(m: DeviceMessage): void {
    switch (m.type) {
      case 'ack':
      case 'results_batch':
        if (!this.settle(m.id, (p) => p.resolve(m))) this.emit('protocolError', `unexpected ${m.type} id=${m.id}`);
        return;
      case 'error':
        if (!this.settle(m.id, (p) => p.reject(new BleError(m.code === 'busy' ? 'busy' : 'device_error', m.message ?? m.code, m.code)))) {
          this.emit('protocolError', `device error ${m.code}: ${m.message ?? ''}`);
        }
        return;
      case 'status':
        if (!this.settle(m.id, (p) => p.resolve(m))) this.emit('status', m);
        return;
      case 'result':
        // A live result may answer start_measurement (same id) but is always also broadcast.
        this.emit('result', m);
        return;
      case 'progress':
        this.emit('progress', m);
        return;
    }
  }

  private onDisconnected(e: BleError | null): void {
    if (this.closed) return;
    this.closed = true;
    for (const [id, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(new BleError('disconnected', 'Device disconnected'));
      this.pending.delete(id);
    }
    this.assembler.reset();
    this.emit('disconnect', e);
    for (const u of this.unsubs) u();
  }

  async close(): Promise<void> {
    if (this.closed) return;
    await this.connection.disconnect();
    this.onDisconnected(null);
  }
}
