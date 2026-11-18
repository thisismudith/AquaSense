import { PARAMETERS, PARAMETER_IDS, isParameterId, type ParameterId } from '@/config/parameters';
import type { ReportFilter } from '@/services/export/reportData';

export const PERIODS = { '7d': 7, '30d': 30, '90d': 90, all: null } as const;
export type Period = keyof typeof PERIODS;

export interface ReportParams {
  parameters: ParameterId[];
  period: Period;
  includeRaw: boolean;
}

/** Route params ⇄ filter (keeps screens 28–30 stateless and deep-linkable). */
export function toRouteParams(p: ReportParams): Record<string, string> {
  return { params: p.parameters.join(','), period: p.period, raw: p.includeRaw ? '1' : '0' };
}

export function fromRouteParams(q: Record<string, string | string[] | undefined>): ReportParams {
  const str = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? '';
  const parameters = str(q.params).split(',').filter(isParameterId);
  const period = (Object.keys(PERIODS) as Period[]).includes(str(q.period) as Period) ? (str(q.period) as Period) : 'all';
  return { parameters, period, includeRaw: str(q.raw) === '1' };
}

export function toFilter(p: ReportParams, now = Date.now()): ReportFilter {
  const days = PERIODS[p.period];
  return { parameters: p.parameters, from: days ? new Date(now - days * 86400000).toISOString() : null, to: null };
}

export function describe(p: ReportParams): string {
  const params = p.parameters.length && p.parameters.length < PARAMETER_IDS.length ? p.parameters.map((x) => PARAMETERS[x].shortLabel).join(', ') : 'all parameters';
  const period = p.period === 'all' ? 'all dates' : `last ${PERIODS[p.period]} days`;
  return `${params}, ${period}`;
}
