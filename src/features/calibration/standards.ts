import type { StandardPoint } from '@/types/domain';

export interface StandardRow {
  c: string;
  a: string;
}

/** Parses the standards table; blank rows are ignored, partially-filled rows are errors. */
export function parseStandards(rows: StandardRow[]): { points: StandardPoint[]; invalidRows: number[] } {
  const points: StandardPoint[] = [];
  const invalidRows: number[] = [];
  rows.forEach((r, i) => {
    if (!r.c.trim() && !r.a.trim()) return;
    const c = Number(r.c.replace(',', '.'));
    const a = Number(r.a.replace(',', '.'));
    if (!r.c.trim() || !r.a.trim() || !Number.isFinite(c) || !Number.isFinite(a)) invalidRows.push(i);
    else points.push({ concentration: c, absorbance: a });
  });
  return { points, invalidRows };
}
