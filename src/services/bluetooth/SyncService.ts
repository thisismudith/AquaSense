import { BLE_PROTOCOL } from '@/config/ble';
import type { Repositories } from '@/database/repositories';
import { isParameterId } from '@/config/parameters';
import type { TestResult } from '@/types/domain';
import { nowIso } from '@/utils/id';

import type { DeviceSession } from './BLEConnection';
import { toNewTestResult } from './BLEDataParser';
import { BleError } from './BLETypes';

export interface SyncReport {
  received: number;
  inserted: number;
  duplicates: number;
  invalid: { deviceTestId: string | null; detail: string }[];
  insertedResults: TestResult[];
}

/** Maps the calibration a device result reports (parameter + version) to the local calibration record, if known. */
export async function resolveCalibrationId(repos: Repositories, raw: unknown): Promise<string | null> {
  if (typeof raw !== 'object' || raw === null) return null;
  const r = raw as { parameter?: unknown; calibration?: { version?: unknown } | null };
  const version = r.calibration?.version;
  if (!isParameterId(r.parameter) || typeof version !== 'number') return null;
  const match = (await repos.calibrations.list(r.parameter)).find((c) => c.calibrationVersion === version);
  return match?.calibrationId ?? null;
}

/**
 * A16: retrieves results stored on ESP32-A since the last synced device test ID.
 * Duplicates are prevented by UNIQUE(device_id, device_test_id); the cursor is persisted after each batch
 * so an interrupted sync resumes without loss.
 */
export class SyncService {
  constructor(private readonly repos: Repositories) {}

  async syncStoredResults(
    session: DeviceSession,
    deviceId: string,
    opts: { batchSize?: number; linkSample?: (raw: unknown) => string | null } = {},
  ): Promise<SyncReport> {
    const report: SyncReport = { received: 0, inserted: 0, duplicates: 0, invalid: [], insertedResults: [] };
    const meta = await this.repos.devices.getSyncMetadata(deviceId);
    let cursor = meta.lastSyncedDeviceResultId;
    for (let guard = 0; guard < 10_000; guard++) {
      const resp = await session.request({ cmd: 'get_results', after: cursor, limit: opts.batchSize ?? BLE_PROTOCOL.syncBatchSize });
      if (resp.type !== 'results_batch') throw new BleError('protocol_error', `Expected results_batch, got ${resp.type}`);
      let lastId = cursor;
      for (const raw of resp.results) {
        report.received++;
        const deviceTestId = typeof raw === 'object' && raw !== null && typeof (raw as { device_test_id?: unknown }).device_test_id === 'string'
          ? (raw as { device_test_id: string }).device_test_id
          : null;
        const mapped = toNewTestResult(raw, {
          deviceId,
          calibrationId: await resolveCalibrationId(this.repos, raw),
          phoneTimestamp: nowIso(),
          sampleId: opts.linkSample?.(raw) ?? null,
        });
        if (deviceTestId) lastId = deviceTestId;
        if (!mapped.ok) {
          report.invalid.push({ deviceTestId, detail: mapped.detail });
          continue;
        }
        const out = await this.repos.results.insert(mapped.value);
        if (out.inserted) {
          report.inserted++;
          report.insertedResults.push(out.result);
        } else report.duplicates++;
      }
      if (lastId === cursor && resp.more) throw new BleError('protocol_error', 'Device reported more results but cursor did not advance');
      cursor = lastId;
      await this.repos.devices.updateSyncMetadata({
        deviceId,
        lastSyncTimestamp: nowIso(),
        lastSyncedDeviceResultId: cursor,
        pendingSyncRecords: resp.more ? Math.max(1, meta.pendingSyncRecords) : 0,
      });
      if (!resp.more) break;
    }
    return report;
  }
}
