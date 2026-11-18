import type { ParameterId } from '@/config/parameters';
import { TestResultSchema, type NewTestResult, type TestResult } from '@/types/domain';
import { createId, nowIso } from '@/utils/id';

import type { Database, SqlValue } from '../types';
import { parseJsonColumn, toJson } from './json';
import { escapeLike } from './SampleRepository';

interface ResultRow {
  result_id: string;
  device_test_id: string;
  device_id: string;
  sample_id: string | null;
  parameter: string;
  raw_idark: number | null;
  raw_iblank: number | null;
  raw_isample: number | null;
  absorbance: number | null;
  concentration: number | null;
  camera_rgb_values: string | null;
  camera_validation_status: string | null;
  retest_required: number;
  measurement_quality_status: string;
  device_warnings: string | null;
  dilution_factor: number;
  final_reported_concentration: number | null;
  calibration_id: string | null;
  device_calibration_meta: string | null;
  firmware_version: string | null;
  device_timestamp: string | null;
  phone_timestamp: string;
  created_at: string;
}

const COLS = `result_id, device_test_id, device_id, sample_id, parameter, raw_idark, raw_iblank, raw_isample, absorbance,
concentration, camera_rgb_values, camera_validation_status, retest_required, measurement_quality_status, device_warnings,
dilution_factor, final_reported_concentration, calibration_id, device_calibration_meta, firmware_version, device_timestamp,
phone_timestamp, created_at`;
const PLACEHOLDERS = Array(23).fill('?').join(',');

function fromRow(r: ResultRow): TestResult {
  return TestResultSchema.parse({
    resultId: r.result_id,
    deviceTestId: r.device_test_id,
    deviceId: r.device_id,
    sampleId: r.sample_id,
    parameter: r.parameter,
    rawIdark: r.raw_idark,
    rawIblank: r.raw_iblank,
    rawIsample: r.raw_isample,
    absorbance: r.absorbance,
    concentration: r.concentration,
    cameraRgb: parseJsonColumn('camera_rgb_values', r.camera_rgb_values),
    cameraValidationStatus: r.camera_validation_status,
    retestRequired: r.retest_required === 1,
    measurementQualityStatus: r.measurement_quality_status,
    deviceWarnings: parseJsonColumn<string[]>('device_warnings', r.device_warnings) ?? [],
    dilutionFactor: r.dilution_factor,
    finalReportedConcentration: r.final_reported_concentration,
    calibrationId: r.calibration_id,
    deviceCalibrationMeta: parseJsonColumn('device_calibration_meta', r.device_calibration_meta),
    firmwareVersion: r.firmware_version,
    deviceTimestamp: r.device_timestamp,
    phoneTimestamp: r.phone_timestamp,
    createdAt: r.created_at,
  });
}

function toParams(t: TestResult): SqlValue[] {
  return [
    t.resultId,
    t.deviceTestId,
    t.deviceId,
    t.sampleId,
    t.parameter,
    t.rawIdark,
    t.rawIblank,
    t.rawIsample,
    t.absorbance,
    t.concentration,
    toJson(t.cameraRgb),
    t.cameraValidationStatus,
    t.retestRequired ? 1 : 0,
    t.measurementQualityStatus,
    toJson(t.deviceWarnings),
    t.dilutionFactor,
    t.finalReportedConcentration,
    t.calibrationId,
    toJson(t.deviceCalibrationMeta),
    t.firmwareVersion,
    t.deviceTimestamp,
    t.phoneTimestamp,
    t.createdAt,
  ];
}

/** Final reported = device concentration × dilution factor; null when the device gave no valid concentration. */
export function computeFinalConcentration(concentration: number | null, dilutionFactor: number): number | null {
  if (concentration === null || !Number.isFinite(concentration)) return null;
  return concentration * dilutionFactor;
}

export interface ResultFilter {
  parameters?: ParameterId[];
  search?: string;
  from?: string;
  to?: string;
  sampleId?: string;
  limit?: number;
  offset?: number;
}

export type InsertOutcome = { inserted: true; result: TestResult } | { inserted: false; duplicateOf: string };

export class TestResultRepository {
  constructor(private readonly db: Database) {}

  /** Inserts a device result. Duplicate (deviceId, deviceTestId) is detected and NOT inserted (A16). */
  async insert(input: NewTestResult): Promise<InsertOutcome> {
    const dilutionFactor = input.dilutionFactor ?? 1;
    const result = TestResultSchema.parse({
      ...input,
      dilutionFactor,
      resultId: createId(),
      createdAt: nowIso(),
      finalReportedConcentration: computeFinalConcentration(input.concentration, dilutionFactor),
    });
    const existing = await this.findByDeviceTestId(result.deviceId, result.deviceTestId);
    if (existing) return { inserted: false, duplicateOf: existing.resultId };
    const r = await this.db.run(`INSERT OR IGNORE INTO test_results (${COLS}) VALUES (${PLACEHOLDERS})`, toParams(result));
    if (r.changes === 0) {
      const dup = await this.findByDeviceTestId(result.deviceId, result.deviceTestId);
      return { inserted: false, duplicateOf: dup?.resultId ?? '' };
    }
    return { inserted: true, result };
  }

  async insertRaw(t: TestResult): Promise<void> {
    await this.db.run(`INSERT INTO test_results (${COLS}) VALUES (${PLACEHOLDERS})`, toParams(TestResultSchema.parse(t)));
  }

  async findByDeviceTestId(deviceId: string, deviceTestId: string): Promise<TestResult | null> {
    const r = await this.db.get<ResultRow>(`SELECT ${COLS} FROM test_results WHERE device_id=? AND device_test_id=?`, [
      deviceId,
      deviceTestId,
    ]);
    return r ? fromRow(r) : null;
  }

  async getById(id: string): Promise<TestResult | null> {
    const r = await this.db.get<ResultRow>(`SELECT ${COLS} FROM test_results WHERE result_id=?`, [id]);
    return r ? fromRow(r) : null;
  }

  /** Applies a dilution factor. The original device concentration is never modified (A13). */
  async setDilution(resultId: string, dilutionFactor: number): Promise<TestResult> {
    if (!Number.isFinite(dilutionFactor) || dilutionFactor < 1) throw new RangeError('Dilution factor must be a finite number ≥ 1');
    const existing = await this.getById(resultId);
    if (!existing) throw new Error(`Result ${resultId} not found`);
    const final = computeFinalConcentration(existing.concentration, dilutionFactor);
    await this.db.run('UPDATE test_results SET dilution_factor=?, final_reported_concentration=? WHERE result_id=?', [
      dilutionFactor,
      final,
      resultId,
    ]);
    return { ...existing, dilutionFactor, finalReportedConcentration: final };
  }

  async attachSample(resultId: string, sampleId: string | null): Promise<void> {
    const r = await this.db.run('UPDATE test_results SET sample_id=? WHERE result_id=?', [sampleId, resultId]);
    if (r.changes === 0) throw new Error(`Result ${resultId} not found`);
  }

  async list(f: ResultFilter = {}): Promise<TestResult[]> {
    const where: string[] = [];
    const params: SqlValue[] = [];
    if (f.parameters?.length) {
      where.push(`t.parameter IN (${f.parameters.map(() => '?').join(',')})`);
      params.push(...f.parameters);
    }
    if (f.sampleId) {
      where.push('t.sample_id = ?');
      params.push(f.sampleId);
    }
    if (f.from) {
      where.push('t.created_at >= ?');
      params.push(f.from);
    }
    if (f.to) {
      where.push('t.created_at <= ?');
      params.push(f.to);
    }
    if (f.search?.trim()) {
      const q = `%${escapeLike(f.search.trim())}%`;
      where.push("(s.sample_name LIKE ? ESCAPE '\\' OR s.notes LIKE ? ESCAPE '\\' OR t.device_test_id LIKE ? ESCAPE '\\')");
      params.push(q, q, q);
    }
    const cols = COLS.split(',')
      .map((c) => `t.${c.trim()}`)
      .join(', ');
    const sql = `SELECT ${cols} FROM test_results t LEFT JOIN samples s ON s.sample_id = t.sample_id
      ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY t.created_at DESC LIMIT ? OFFSET ?`;
    const rows = await this.db.all<ResultRow>(sql, [...params, f.limit ?? 1000, f.offset ?? 0]);
    return rows.map(fromRow);
  }

  async count(): Promise<number> {
    const r = await this.db.get<{ n: number }>('SELECT COUNT(*) AS n FROM test_results');
    return r?.n ?? 0;
  }

  async delete(id: string): Promise<boolean> {
    return (await this.db.run('DELETE FROM test_results WHERE result_id=?', [id])).changes > 0;
  }
}
