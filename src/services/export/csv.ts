import { PARAMETERS } from '@/config/parameters';

import { methodOf, type ReportRow } from './reportData';

type Cell = string | number | boolean | null | undefined;

/**
 * RFC 4180 cell encoding. Text cells that start with = + - @ (or tab/CR) are prefixed with ' to prevent
 * spreadsheet formula injection from user-entered text (sample names, notes). Numbers are written as numbers.
 */
export function csvCell(v: Cell): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : '';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  let s = v;
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export const CSV_COLUMNS = [
  'result_id',
  'device_test_id',
  'device_id',
  'parameter',
  'method',
  'sample_name',
  'source_type',
  'notes',
  'latitude',
  'longitude',
  'location_accuracy_m',
  'location_timestamp',
  'device_timestamp',
  'phone_timestamp',
  'unit',
  'device_concentration',
  'dilution_factor',
  'final_reported_concentration',
  'absorbance',
  'raw_idark',
  'raw_iblank',
  'raw_isample',
  'quality_status',
  'retest_required',
  'camera_validation_status',
  'camera_r',
  'camera_g',
  'camera_b',
  'device_warnings',
  'calibration_version',
  'calibration_slope',
  'calibration_intercept',
  'calibration_r_squared',
  'firmware_version',
] as const;

/** CSV values are always in mg/L (storage unit) so files are unambiguous regardless of display setting. */
export function buildCsv(rows: readonly ReportRow[]): string {
  const lines = [CSV_COLUMNS.join(',')];
  for (const { result: r, sample: s, calibration: c } of rows) {
    const meta = r.deviceCalibrationMeta as { version?: number; slope?: number; intercept?: number } | null;
    const cells: Cell[] = [
      r.resultId,
      r.deviceTestId,
      r.deviceId,
      PARAMETERS[r.parameter].shortLabel,
      methodOf(r.parameter),
      s?.sampleName,
      s?.sourceType,
      s?.notes,
      s?.location?.latitude,
      s?.location?.longitude,
      s?.location?.accuracy,
      s?.location?.timestamp,
      r.deviceTimestamp,
      r.phoneTimestamp,
      'mg/L',
      r.concentration,
      r.dilutionFactor,
      r.finalReportedConcentration,
      r.absorbance,
      r.rawIdark,
      r.rawIblank,
      r.rawIsample,
      r.measurementQualityStatus,
      r.retestRequired,
      r.cameraValidationStatus,
      r.cameraRgb?.r,
      r.cameraRgb?.g,
      r.cameraRgb?.b,
      r.deviceWarnings.join(';'),
      c?.calibrationVersion ?? meta?.version,
      c?.slope ?? meta?.slope,
      c?.intercept ?? meta?.intercept,
      c?.rSquared,
      r.firmwareVersion,
    ];
    lines.push(cells.map(csvCell).join(','));
  }
  // CRLF per RFC 4180; BOM so spreadsheet apps detect UTF-8 (µ, ₂, ⁻).
  return `﻿${lines.join('\r\n')}\r\n`;
}
