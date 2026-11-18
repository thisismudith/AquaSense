import type { StandardPoint } from '@/types/domain';

import type { Result } from '../measurement/photometry';

/**
 * Calibration line fitted in the app (feature list design table): A = m·C + c by ordinary least squares,
 * x = concentration of standard, y = measured absorbance (DECISIONS A2).
 */
export interface LinearFit {
  slope: number;
  intercept: number;
  rSquared: number;
  n: number;
  /** Residual standard deviation s_y/x (n − 2 dof); null when n < 3. */
  residualSd: number | null;
  minConcentration: number;
  maxConcentration: number;
}

export type FitError = 'too_few_standards' | 'non_finite_value' | 'negative_concentration' | 'identical_concentrations' | 'zero_slope';

export const MIN_STANDARDS = 2;

export function fitCalibration(points: readonly StandardPoint[]): Result<LinearFit, FitError> {
  if (points.length < MIN_STANDARDS) return { ok: false, error: 'too_few_standards' };
  if (!points.every((p) => Number.isFinite(p.concentration) && Number.isFinite(p.absorbance))) return { ok: false, error: 'non_finite_value' };
  if (points.some((p) => p.concentration < 0)) return { ok: false, error: 'negative_concentration' };
  const n = points.length;
  const mx = points.reduce((a, p) => a + p.concentration, 0) / n;
  const my = points.reduce((a, p) => a + p.absorbance, 0) / n;
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (const p of points) {
    const dx = p.concentration - mx;
    const dy = p.absorbance - my;
    sxx += dx * dx;
    sxy += dx * dy;
    syy += dy * dy;
  }
  if (sxx === 0) return { ok: false, error: 'identical_concentrations' };
  const slope = sxy / sxx;
  if (slope === 0 || !Number.isFinite(slope)) return { ok: false, error: 'zero_slope' };
  const intercept = my - slope * mx;
  let ssRes = 0;
  for (const p of points) ssRes += (p.absorbance - (slope * p.concentration + intercept)) ** 2;
  // syy = 0 means every absorbance identical → slope would be 0 (handled above); guard anyway.
  const rSquared = syy === 0 ? 1 : Math.max(0, Math.min(1, 1 - ssRes / syy));
  const residualSd = n >= 3 ? Math.sqrt(ssRes / (n - 2)) : null;
  const xs = points.map((p) => p.concentration);
  return {
    ok: true,
    value: { slope, intercept, rSquared, n, residualSd, minConcentration: Math.min(...xs), maxConcentration: Math.max(...xs) },
  };
}

/**
 * LOD / LOQ. The feature list requires them but does not specify the method (DECISIONS D9).
 * `method: null` (default) → not computed. 'residual_sd' = ICH Q2: LOD = 3.3·σ/|m|, LOQ = 10·σ/|m| with σ = s_y/x.
 * Enable only once the lab confirms the method.
 */
export type LodMethod = 'residual_sd' | null;
export const LOD_METHOD: LodMethod = null;

export function computeLodLoq(fit: LinearFit, method: LodMethod = LOD_METHOD): { lod: number | null; loq: number | null } {
  if (method !== 'residual_sd' || fit.residualSd === null) return { lod: null, loq: null };
  const m = Math.abs(fit.slope);
  return { lod: (3.3 * fit.residualSd) / m, loq: (10 * fit.residualSd) / m };
}
