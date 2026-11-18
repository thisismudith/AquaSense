import { PARAMETERS, type ParameterId } from '@/config/parameters';
import type { Repositories } from '@/database/repositories';
import type { Calibration, Sample, TestResult } from '@/types/domain';

export interface ReportRow {
  result: TestResult;
  sample: Sample | null;
  calibration: Calibration | null;
}

export interface ReportFilter {
  parameters: ParameterId[];
  from: string | null;
  to: string | null;
  sampleId?: string | null;
}

export async function loadReportRows(repos: Repositories, f: ReportFilter): Promise<ReportRow[]> {
  const results = await repos.results.list({
    parameters: f.parameters.length ? f.parameters : undefined,
    from: f.from ?? undefined,
    to: f.to ?? undefined,
    sampleId: f.sampleId ?? undefined,
    limit: 100000,
  });
  const samples = new Map<string, Sample | null>();
  const cals = new Map<string, Calibration | null>();
  const rows: ReportRow[] = [];
  for (const r of results) {
    if (r.sampleId && !samples.has(r.sampleId)) samples.set(r.sampleId, await repos.samples.getById(r.sampleId));
    if (r.calibrationId && !cals.has(r.calibrationId)) cals.set(r.calibrationId, await repos.calibrations.getById(r.calibrationId));
    rows.push({ result: r, sample: r.sampleId ? (samples.get(r.sampleId) ?? null) : null, calibration: r.calibrationId ? (cals.get(r.calibrationId) ?? null) : null });
  }
  return rows;
}

export const methodOf = (p: ParameterId): string => `${PARAMETERS[p].reagent} photometric, 525 nm`;
