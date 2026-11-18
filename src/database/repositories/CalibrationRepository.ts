import type { ParameterId } from '@/config/parameters';
import { CalibrationSchema, type Calibration, type StandardPoint } from '@/types/domain';
import { createId, nowIso } from '@/utils/id';

import type { Database, SqlValue } from '../types';
import { parseJsonColumn } from './json';

interface CalRow {
  calibration_id: string;
  parameter: string;
  slope: number;
  intercept: number;
  r_squared: number | null;
  lod: number | null;
  loq: number | null;
  calibration_date: string;
  calibration_version: number;
  standards_used: string;
  calibration_status: string;
  sent_to_device_at: string | null;
}

const COLS =
  'calibration_id, parameter, slope, intercept, r_squared, lod, loq, calibration_date, calibration_version, standards_used, calibration_status, sent_to_device_at';

function fromRow(r: CalRow): Calibration {
  return CalibrationSchema.parse({
    calibrationId: r.calibration_id,
    parameter: r.parameter,
    slope: r.slope,
    intercept: r.intercept,
    rSquared: r.r_squared,
    lod: r.lod,
    loq: r.loq,
    calibrationDate: r.calibration_date,
    calibrationVersion: r.calibration_version,
    standardsUsed: parseJsonColumn('standards_used', r.standards_used),
    calibrationStatus: r.calibration_status,
    sentToDeviceAt: r.sent_to_device_at,
  });
}

function toParams(c: Calibration): SqlValue[] {
  return [
    c.calibrationId,
    c.parameter,
    c.slope,
    c.intercept,
    c.rSquared,
    c.lod,
    c.loq,
    c.calibrationDate,
    c.calibrationVersion,
    JSON.stringify(c.standardsUsed),
    c.calibrationStatus,
    c.sentToDeviceAt,
  ];
}

export interface NewCalibration {
  parameter: ParameterId;
  slope: number;
  intercept: number;
  rSquared: number | null;
  lod: number | null;
  loq: number | null;
  standardsUsed: StandardPoint[];
  status: 'active' | 'draft';
}

export class CalibrationRepository {
  constructor(private readonly db: Database) {}

  /**
   * Stores a new calibration version. Previous versions are never modified except that an
   * `active` save marks the previously active one `superseded` (history preserved).
   */
  async saveNewVersion(input: NewCalibration): Promise<Calibration> {
    return this.db.transaction(async () => {
      const row = await this.db.get<{ v: number | null }>('SELECT MAX(calibration_version) AS v FROM calibrations WHERE parameter=?', [
        input.parameter,
      ]);
      const cal = CalibrationSchema.parse({
        calibrationId: createId(),
        parameter: input.parameter,
        slope: input.slope,
        intercept: input.intercept,
        rSquared: input.rSquared,
        lod: input.lod,
        loq: input.loq,
        calibrationDate: nowIso(),
        calibrationVersion: (row?.v ?? 0) + 1,
        standardsUsed: input.standardsUsed,
        calibrationStatus: input.status,
        sentToDeviceAt: null,
      });
      if (cal.calibrationStatus === 'active') {
        await this.db.run("UPDATE calibrations SET calibration_status='superseded' WHERE parameter=? AND calibration_status='active'", [
          cal.parameter,
        ]);
      }
      await this.db.run(`INSERT INTO calibrations (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, toParams(cal));
      return cal;
    });
  }

  async insertRaw(c: Calibration): Promise<void> {
    await this.db.run(`INSERT INTO calibrations (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, toParams(CalibrationSchema.parse(c)));
  }

  async activate(id: string): Promise<Calibration> {
    return this.db.transaction(async () => {
      const cal = await this.getById(id);
      if (!cal) throw new Error(`Calibration ${id} not found`);
      await this.db.run("UPDATE calibrations SET calibration_status='superseded' WHERE parameter=? AND calibration_status='active'", [
        cal.parameter,
      ]);
      await this.db.run("UPDATE calibrations SET calibration_status='active' WHERE calibration_id=?", [id]);
      return { ...cal, calibrationStatus: 'active' as const };
    });
  }

  async getById(id: string): Promise<Calibration | null> {
    const r = await this.db.get<CalRow>(`SELECT ${COLS} FROM calibrations WHERE calibration_id=?`, [id]);
    return r ? fromRow(r) : null;
  }

  async getActive(parameter: ParameterId): Promise<Calibration | null> {
    const r = await this.db.get<CalRow>(`SELECT ${COLS} FROM calibrations WHERE parameter=? AND calibration_status='active'`, [
      parameter,
    ]);
    return r ? fromRow(r) : null;
  }

  async list(parameter?: ParameterId): Promise<Calibration[]> {
    const rows = parameter
      ? await this.db.all<CalRow>(`SELECT ${COLS} FROM calibrations WHERE parameter=? ORDER BY calibration_version DESC`, [parameter])
      : await this.db.all<CalRow>(`SELECT ${COLS} FROM calibrations ORDER BY parameter, calibration_version DESC`);
    return rows.map(fromRow);
  }

  async markSentToDevice(id: string, at = nowIso()): Promise<void> {
    await this.db.run('UPDATE calibrations SET sent_to_device_at=? WHERE calibration_id=?', [at, id]);
  }
}
