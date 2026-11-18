import { KNOWN_DEVICE_WARNINGS, type MeasurementQuality, type TestResult } from '@/types/domain';

import { computeAbsorbance, computeConcentration, type LinearCalibration } from './photometry';

/**
 * Maps firmware-reported flags to one quality status. Priority (most severe first):
 * invalid > retest_required > unstable > over_range > below_detection > ok.
 */
export function deriveQualityStatus(input: {
  concentrationValid: boolean;
  retestRequired: boolean;
  warnings: readonly string[];
}): MeasurementQuality {
  if (!input.concentrationValid) return 'invalid';
  const w = new Set(input.warnings);
  if (input.retestRequired || w.has('retest_needed')) return 'retest_required';
  if (w.has('unstable_reading')) return 'unstable';
  if (w.has('over_range')) return 'over_range';
  if (w.has('below_detection')) return 'below_detection';
  return 'ok';
}

export function isKnownWarning(code: string): boolean {
  return (KNOWN_DEVICE_WARNINGS as readonly string[]).includes(code);
}

export interface StabilityResult {
  n: number;
  mean: number;
  sd: number;
  /** Coefficient of variation (sd / |mean|); null when mean is 0. */
  cv: number | null;
  /** null when no threshold is configured (criterion not specified by firmware docs). */
  unstable: boolean | null;
}

/**
 * Repeat-reading statistics (feature list D13). The device owns the decision; the threshold here is
 * configurable and `null` by default because the stability criterion is not yet specified.
 */
export function assessStability(readings: readonly number[], maxCv: number | null = null): StabilityResult | null {
  const xs = readings.filter(Number.isFinite);
  if (xs.length < 2) return null;
  const mean = xs.reduce((a, b) => a + b, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((a, b) => a + (b - mean) ** 2, 0) / (xs.length - 1));
  const cv = mean === 0 ? null : sd / Math.abs(mean);
  const unstable = maxCv === null ? null : cv === null ? true : cv > maxCv;
  return { n: xs.length, mean, sd, cv, unstable };
}

export interface ConsistencyCheck {
  absorbanceMatches: boolean | null;
  concentrationMatches: boolean | null;
  recomputedAbsorbance: number | null;
  recomputedConcentration: number | null;
  issues: string[];
}

/**
 * Validates a device-reported result against its own raw values (and calibration, when known).
 * Does NOT replace the device values — only reports inconsistencies.
 */
export function checkConsistency(
  r: Pick<TestResult, 'rawIdark' | 'rawIblank' | 'rawIsample' | 'absorbance' | 'concentration'>,
  cal: LinearCalibration | null,
  tolerance = { absorbanceAbs: 0.002, concentrationRel: 0.01 },
): ConsistencyCheck {
  const issues: string[] = [];
  const a = computeAbsorbance({ idark: r.rawIdark, iblank: r.rawIblank, isample: r.rawIsample });
  const recomputedAbsorbance = a.ok ? a.value.absorbance : null;
  if (!a.ok) issues.push(`raw:${a.error}`);
  let absorbanceMatches: boolean | null = null;
  if (recomputedAbsorbance !== null && r.absorbance !== null) {
    absorbanceMatches = Math.abs(recomputedAbsorbance - r.absorbance) <= tolerance.absorbanceAbs;
    if (!absorbanceMatches) issues.push('absorbance_mismatch');
  }
  let recomputedConcentration: number | null = null;
  let concentrationMatches: boolean | null = null;
  if (cal && r.absorbance !== null) {
    const c = computeConcentration(r.absorbance, cal);
    if (c.ok) {
      recomputedConcentration = c.value;
      if (r.concentration !== null) {
        const scale = Math.max(Math.abs(c.value), 1e-9);
        concentrationMatches = Math.abs(c.value - r.concentration) / scale <= tolerance.concentrationRel || Math.abs(c.value - r.concentration) < 1e-6;
        if (!concentrationMatches) issues.push('concentration_mismatch');
      }
    } else issues.push(`calibration:${c.error}`);
  }
  return { absorbanceMatches, concentrationMatches, recomputedAbsorbance, recomputedConcentration, issues };
}
