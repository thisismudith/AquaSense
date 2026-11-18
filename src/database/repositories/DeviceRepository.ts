import { DeviceSchema, SyncMetadataSchema, type Device, type SyncMetadata } from '@/types/domain';
import { nowIso } from '@/utils/id';

import type { Database } from '../types';
import { parseJsonColumn, toJson } from './json';

interface DeviceRow {
  device_id: string;
  device_name: string;
  firmware_version: string | null;
  last_connected: string | null;
  last_sync: string | null;
  connection_metadata: string | null;
}
interface SyncRow {
  device_id: string;
  last_sync_timestamp: string | null;
  last_synced_device_result_id: string | null;
  pending_sync_records: number;
}

const fromRow = (r: DeviceRow): Device =>
  DeviceSchema.parse({
    deviceId: r.device_id,
    deviceName: r.device_name,
    firmwareVersion: r.firmware_version,
    lastConnected: r.last_connected,
    lastSync: r.last_sync,
    connectionMetadata: parseJsonColumn('connection_metadata', r.connection_metadata),
  });

export class DeviceRepository {
  constructor(private readonly db: Database) {}

  /** Inserts or updates identity fields; never clears last_sync. */
  async upsert(d: { deviceId: string; deviceName: string; firmwareVersion?: string | null; connectionMetadata?: Record<string, unknown> | null }): Promise<Device> {
    await this.db.run(
      `INSERT INTO devices (device_id, device_name, firmware_version, connection_metadata) VALUES (?,?,?,?)
       ON CONFLICT(device_id) DO UPDATE SET device_name=excluded.device_name,
         firmware_version=COALESCE(excluded.firmware_version, devices.firmware_version),
         connection_metadata=COALESCE(excluded.connection_metadata, devices.connection_metadata)`,
      [d.deviceId, d.deviceName, d.firmwareVersion ?? null, toJson(d.connectionMetadata ?? null)],
    );
    const dev = await this.getById(d.deviceId);
    if (!dev) throw new Error('Device upsert failed');
    return dev;
  }

  async insertRaw(d: Device): Promise<void> {
    const v = DeviceSchema.parse(d);
    await this.db.run(
      'INSERT INTO devices (device_id, device_name, firmware_version, last_connected, last_sync, connection_metadata) VALUES (?,?,?,?,?,?)',
      [v.deviceId, v.deviceName, v.firmwareVersion, v.lastConnected, v.lastSync, toJson(v.connectionMetadata)],
    );
  }

  async getById(id: string): Promise<Device | null> {
    const r = await this.db.get<DeviceRow>('SELECT * FROM devices WHERE device_id=?', [id]);
    return r ? fromRow(r) : null;
  }

  async list(): Promise<Device[]> {
    return (await this.db.all<DeviceRow>('SELECT * FROM devices ORDER BY last_connected DESC')).map(fromRow);
  }

  async markConnected(id: string, at = nowIso()): Promise<void> {
    await this.db.run('UPDATE devices SET last_connected=? WHERE device_id=?', [at, id]);
  }

  async delete(id: string): Promise<boolean> {
    return (await this.db.run('DELETE FROM devices WHERE device_id=?', [id])).changes > 0;
  }

  async getSyncMetadata(deviceId: string): Promise<SyncMetadata> {
    const r = await this.db.get<SyncRow>('SELECT * FROM sync_metadata WHERE device_id=?', [deviceId]);
    return SyncMetadataSchema.parse({
      deviceId,
      lastSyncTimestamp: r?.last_sync_timestamp ?? null,
      lastSyncedDeviceResultId: r?.last_synced_device_result_id ?? null,
      pendingSyncRecords: r?.pending_sync_records ?? 0,
    });
  }

  async hasSyncMetadata(deviceId: string): Promise<boolean> {
    return (await this.db.get('SELECT 1 AS x FROM sync_metadata WHERE device_id=?', [deviceId])) !== null;
  }

  /** Writes sync metadata without opening a transaction (safe to call inside one). */
  async updateSyncMetadataRaw(m: SyncMetadata): Promise<void> {
    const v = SyncMetadataSchema.parse(m);
    await this.db.run(
      `INSERT INTO sync_metadata (device_id, last_sync_timestamp, last_synced_device_result_id, pending_sync_records) VALUES (?,?,?,?)
       ON CONFLICT(device_id) DO UPDATE SET last_sync_timestamp=excluded.last_sync_timestamp,
         last_synced_device_result_id=excluded.last_synced_device_result_id, pending_sync_records=excluded.pending_sync_records`,
      [v.deviceId, v.lastSyncTimestamp, v.lastSyncedDeviceResultId, v.pendingSyncRecords],
    );
    if (v.lastSyncTimestamp) await this.db.run('UPDATE devices SET last_sync=? WHERE device_id=?', [v.lastSyncTimestamp, v.deviceId]);
  }

  async updateSyncMetadata(m: SyncMetadata): Promise<void> {
    await this.db.transaction(() => this.updateSyncMetadataRaw(m));
  }
}
