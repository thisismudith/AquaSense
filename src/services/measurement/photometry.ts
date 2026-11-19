/**
 * Photometer maths exactly as specified (SPECIFICATION.md §4). ESP32-A computes the primary result;
 * these functions exist to VALIDATE received data and to RECALCULATE historically from stored raw values.
 * Invalid inputs yield a typed error — never a fabricated number.
 */

export type Ok<T> = { ok: true; value: T };
export type Err<E extends string> = { ok: false; error: E; detail?: string };
export type Result<T, E extends string> = Ok<T> | Err<E>;

const ok = <T>(value: T): Ok<T> => ({ ok: true, value });
const err = <E extends string>(error: E, detail?: string): Err<E> => ({ ok: false, error, detail });

export interface RawIntensities {
  idark: number | null | undefined;
  iblank: number | null | undefined;
  isample: number | null | undefined;
}

export type AbsorbanceError =
  | 'missing_input'
  | 'non_finite_input'
  | 'negative_intensity'
  | 'blank_not_above_dark'
  | 'sample_not_above_dark';

export interface AbsorbanceValue {
  absorbance: number;
  correctedBlank: number;
  correctedSample: number;
  /** Sample brighter than blank → A < 0. Mathematically valid; flagged for the user. */
  negativeAbsorbance: boolean;
}

/** Dark correction: I − Idark. */
export function darkCorrect(intensity: number, idark: number): number {
  return intensity - idark;
}

/** A = log10((Iblank − Idark) / (Isample − Idark)) */
export function computeAbsorbance(raw: RawIntensities): Result<AbsorbanceValue, AbsorbanceError> {
  const { idark, iblank, isample } = raw;
  if (idark == null || iblank == null || isample == null) return err('missing_input');
  if (![idark, iblank, isample].every(Number.isFinite)) return err('non_finite_input');
  if (idark < 0 || iblank < 0 || isample < 0) return err('negative_intensity');
  const correctedBlank = darkCorrect(iblank, idark);
  const correctedSample = darkCorrect(isample, idark);
  if (!(correctedBlank > 0)) return err('blank_not_above_dark', `Iblank − Idark = ${correctedBlank}`);
  if (!(correctedSample > 0)) return err('sample_not_above_dark', `Isample − Idark = ${correctedSample}`);
  const absorbance = Math.log10(correctedBlank / correctedSample);
  if (!Number.isFinite(absorbance)) return err('non_finite_input');
  return ok({ absorbance, correctedBlank, correctedSample, negativeAbsorbance: absorbance < 0 });
}

export interface LinearCalibration {
  slope: number;
  intercept: number;
}

export type ConcentrationError = 'missing_calibration' | 'invalid_slope' | 'invalid_intercept' | 'non_finite_absorbance';

/** C = (A − c) / m */
export function computeConcentration(absorbance: number | null | undefined, cal: LinearCalibration | null | undefined): Result<number, ConcentrationError> {
  if (!cal) return err('missing_calibration');
  if (!Number.isFinite(cal.slope) || cal.slope === 0) return err('invalid_slope');
  if (!Number.isFinite(cal.intercept)) return err('invalid_intercept');
  if (absorbance == null || !Number.isFinite(absorbance)) return err('non_finite_absorbance');
  const c = (absorbance - cal.intercept) / cal.slope;
  return Number.isFinite(c) ? ok(c) : err('non_finite_absorbance');
}

export type RangeStatus = 'below_detection' | 'in_range' | 'over_range' | 'unknown';

/**
 * Feature list D14: over range = above the top calibration point; below detection = below the lowest point
 * (or below LOD when a lab-confirmed LOD exists). The DEVICE decides for live results; this is for recalculation display.
 */
export function classifyRange(
  concentration: number | null,
  bounds: { lowest: number | null; highest: number | null; lod?: number | null },
): RangeStatus {
  if (concentration === null || !Number.isFinite(concentration)) return 'unknown';
  const low = bounds.lod ?? bounds.lowest;
  if (low !== null && low !== undefined && concentration < low) return 'below_detection';
  if (bounds.highest !== null && concentration > bounds.highest) return 'over_range';
  if (low == null && bounds.highest == null) return 'unknown';
  return 'in_range';
}

export type DilutionError = 'non_finite' | 'non_positive_volume' | 'sample_exceeds_total' | 'factor_below_one';

/** Dilution factor = total volume / sample aliquot volume (≥ 1). */
export function dilutionFactorFromVolumes(sampleVolume: number, totalVolume: number): Result<number, DilutionError> {
  if (!Number.isFinite(sampleVolume) || !Number.isFinite(totalVolume)) return err('non_finite');
  if (sampleVolume <= 0 || totalVolume <= 0) return err('non_positive_volume');
  if (sampleVolume > totalVolume) return err('sample_exceeds_total');
  return ok(totalVolume / sampleVolume);
}

export function validateDilutionFactor(f: number): Result<number, DilutionError> {
  if (!Number.isFinite(f)) return err('non_finite');
  if (f < 1) return err('factor_below_one');
  return ok(f);
}

/** Corrected (original-sample) concentration = measured × dilution factor. Original value is not modified. */
export function correctForDilution(measured: number | null, factor: number): Result<number, DilutionError | 'no_measurement'> {
  const f = validateDilutionFactor(factor);
  if (!f.ok) return f;
  if (measured === null || !Number.isFinite(measured)) return err('no_measurement');
  return ok(measured * f.value);
}

/**
 * Suggests a dilution factor that brings an over-range reading below the top of the range.
 * Rounds up to a practical factor (2, 5, 10, 20, 50, 100). Returns null if no suggestion applies.
 */
export function suggestDilution(concentration: number | null, rangeMax: number | null): number | null {
  if (concentration === null || rangeMax === null || !Number.isFinite(concentration) || !(rangeMax > 0)) return null;
  if (concentration <= rangeMax) return null;
  const needed = concentration / (rangeMax * 0.8);
  return [2, 5, 10, 20, 50, 100].find((f) => f >= needed) ?? null;
}
