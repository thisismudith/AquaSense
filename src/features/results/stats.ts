import type { TestResult } from '@/types/domain';

export interface ParameterStats {
  count: number;
  valid: number;
  mean: number | null;
  min: number | null;
  max: number | null;
  retestRate: number;
  latest: TestResult | null;
}

/** Summary over final reported concentrations; invalid (null) results are counted but never averaged in. */
export function computeStats(results: readonly TestResult[]): ParameterStats {
  const vals = results.map((r) => r.finalReportedConcentration).filter((v): v is number => v !== null && Number.isFinite(v));
  const sorted = [...results].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return {
    count: results.length,
    valid: vals.length,
    mean: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : null,
    min: vals.length ? Math.min(...vals) : null,
    max: vals.length ? Math.max(...vals) : null,
    retestRate: results.length ? results.filter((r) => r.retestRequired).length / results.length : 0,
    latest: sorted[0] ?? null,
  };
}

/** Chronological chart points (x = epoch ms) of valid final concentrations. */
export function toSeries(results: readonly TestResult[]): { x: number; y: number }[] {
  return results
    .filter((r) => r.finalReportedConcentration !== null && Number.isFinite(r.finalReportedConcentration))
    .map((r) => ({ x: Date.parse(r.deviceTimestamp ?? r.createdAt), y: r.finalReportedConcentration as number }))
    .sort((a, b) => a.x - b.x);
}
