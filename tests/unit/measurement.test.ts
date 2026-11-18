import { parseCameraValidation } from '@/services/measurement/cameraValidation';
import {
  classifyRange,
  computeAbsorbance,
  computeConcentration,
  correctForDilution,
  darkCorrect,
  dilutionFactorFromVolumes,
  suggestDilution,
  validateDilutionFactor,
} from '@/services/measurement/photometry';
import { assessStability, checkConsistency, deriveQualityStatus } from '@/services/measurement/quality';

describe('computeAbsorbance (UNIT)', () => {
  it('matches A = log10((Ib − Id)/(Is − Id))', () => {
    const r = computeAbsorbance({ idark: 100, iblank: 10100, isample: 1100 });
    expect(r.ok && r.value.absorbance).toBeCloseTo(1, 12);
    expect(r.ok && r.value.correctedBlank).toBe(10000);
    expect(darkCorrect(500, 100)).toBe(400);
  });

  it('A = 0 when sample equals blank', () => {
    const r = computeAbsorbance({ idark: 0, iblank: 5000, isample: 5000 });
    expect(r).toEqual({ ok: true, value: { absorbance: 0, correctedBlank: 5000, correctedSample: 5000, negativeAbsorbance: false } });
  });

  it('flags negative absorbance when sample brighter than blank', () => {
    const r = computeAbsorbance({ idark: 0, iblank: 1000, isample: 2000 });
    expect(r.ok && r.value.negativeAbsorbance).toBe(true);
    expect(r.ok && r.value.absorbance).toBeCloseTo(-Math.log10(2));
  });

  it.each([
    [{ idark: 0, iblank: 0, isample: 0 }, 'blank_not_above_dark'],
    [{ idark: 100, iblank: 100, isample: 50 }, 'blank_not_above_dark'],
    [{ idark: 100, iblank: 90, isample: 50 }, 'blank_not_above_dark'],
    [{ idark: 100, iblank: 5000, isample: 100 }, 'sample_not_above_dark'],
    [{ idark: 100, iblank: 5000, isample: 0 }, 'sample_not_above_dark'],
    [{ idark: 0, iblank: 5000, isample: 0 }, 'sample_not_above_dark'],
    [{ idark: Number.NaN, iblank: 5000, isample: 10 }, 'non_finite_input'],
    [{ idark: 0, iblank: Number.POSITIVE_INFINITY, isample: 10 }, 'non_finite_input'],
    [{ idark: 0, iblank: 5000, isample: Number.NEGATIVE_INFINITY }, 'non_finite_input'],
    [{ idark: -1, iblank: 5000, isample: 10 }, 'negative_intensity'],
    [{ idark: null, iblank: 5000, isample: 10 }, 'missing_input'],
    [{ idark: 0, iblank: undefined, isample: 10 }, 'missing_input'],
  ])('rejects %o with %s', (input, error) => {
    expect(computeAbsorbance(input)).toMatchObject({ ok: false, error });
  });
});

describe('computeConcentration (UNIT)', () => {
  it('C = (A − c)/m', () => {
    const r = computeConcentration(0.85, { slope: 0.8, intercept: 0.05 });
    expect(r.ok && r.value).toBeCloseTo(1);
  });
  it('negative slopes are allowed (non-zero)', () => {
    expect(computeConcentration(0.1, { slope: -2, intercept: 0.5 })).toMatchObject({ ok: true, value: 0.2 });
  });
  it.each([
    [0.5, null, 'missing_calibration'],
    [0.5, { slope: 0, intercept: 0 }, 'invalid_slope'],
    [0.5, { slope: Number.NaN, intercept: 0 }, 'invalid_slope'],
    [0.5, { slope: Number.POSITIVE_INFINITY, intercept: 0 }, 'invalid_slope'],
    [0.5, { slope: 1, intercept: Number.NaN }, 'invalid_intercept'],
    [Number.NaN, { slope: 1, intercept: 0 }, 'non_finite_absorbance'],
    [null, { slope: 1, intercept: 0 }, 'non_finite_absorbance'],
    [Number.POSITIVE_INFINITY, { slope: 1, intercept: 0 }, 'non_finite_absorbance'],
    [1e308, { slope: 1e-308, intercept: 0 }, 'non_finite_absorbance'],
  ])('A=%p cal=%o → %s', (a, cal, error) => {
    expect(computeConcentration(a, cal)).toMatchObject({ ok: false, error });
  });
});

describe('classifyRange (UNIT)', () => {
  const b = { lowest: 0.05, highest: 1 };
  it('classifies', () => {
    expect(classifyRange(0.01, b)).toBe('below_detection');
    expect(classifyRange(0.05, b)).toBe('in_range');
    expect(classifyRange(1, b)).toBe('in_range');
    expect(classifyRange(1.01, b)).toBe('over_range');
    expect(classifyRange(0.04, { ...b, lod: 0.03 })).toBe('in_range');
    expect(classifyRange(null, b)).toBe('unknown');
    expect(classifyRange(Number.NaN, b)).toBe('unknown');
    expect(classifyRange(0.5, { lowest: null, highest: null })).toBe('unknown');
  });
});

describe('dilution (UNIT)', () => {
  it('factor from volumes', () => {
    expect(dilutionFactorFromVolumes(1, 10)).toEqual({ ok: true, value: 10 });
    expect(dilutionFactorFromVolumes(5, 5)).toEqual({ ok: true, value: 1 });
    expect(dilutionFactorFromVolumes(0, 10)).toMatchObject({ error: 'non_positive_volume' });
    expect(dilutionFactorFromVolumes(-1, 10)).toMatchObject({ error: 'non_positive_volume' });
    expect(dilutionFactorFromVolumes(11, 10)).toMatchObject({ error: 'sample_exceeds_total' });
    expect(dilutionFactorFromVolumes(Number.NaN, 10)).toMatchObject({ error: 'non_finite' });
  });
  it('correction', () => {
    expect(correctForDilution(0.3, 10)).toMatchObject({ ok: true });
    expect((correctForDilution(0.3, 10) as { value: number }).value).toBeCloseTo(3);
    expect(correctForDilution(0.3, 0.5)).toMatchObject({ error: 'factor_below_one' });
    expect(correctForDilution(0.3, 0)).toMatchObject({ error: 'factor_below_one' });
    expect(correctForDilution(null, 2)).toMatchObject({ error: 'no_measurement' });
    expect(validateDilutionFactor(Number.POSITIVE_INFINITY)).toMatchObject({ error: 'non_finite' });
  });
  it('suggests practical factors only when over range', () => {
    expect(suggestDilution(0.5, 1)).toBeNull();
    expect(suggestDilution(1.5, 1)).toBe(2);
    expect(suggestDilution(7, 1)).toBe(10);
    expect(suggestDilution(1000, 1)).toBeNull();
    expect(suggestDilution(2, null)).toBeNull();
  });
});

describe('quality (UNIT)', () => {
  it('derives status by priority', () => {
    expect(deriveQualityStatus({ concentrationValid: false, retestRequired: true, warnings: [] })).toBe('invalid');
    expect(deriveQualityStatus({ concentrationValid: true, retestRequired: true, warnings: ['over_range'] })).toBe('retest_required');
    expect(deriveQualityStatus({ concentrationValid: true, retestRequired: false, warnings: ['retest_needed'] })).toBe('retest_required');
    expect(deriveQualityStatus({ concentrationValid: true, retestRequired: false, warnings: ['below_detection', 'unstable_reading'] })).toBe('unstable');
    expect(deriveQualityStatus({ concentrationValid: true, retestRequired: false, warnings: ['over_range'] })).toBe('over_range');
    expect(deriveQualityStatus({ concentrationValid: true, retestRequired: false, warnings: ['below_detection'] })).toBe('below_detection');
    expect(deriveQualityStatus({ concentrationValid: true, retestRequired: false, warnings: ['cloudy_sample'] })).toBe('ok');
  });

  it('stability statistics; no verdict without configured threshold', () => {
    const s = assessStability([100, 102, 98, 100]);
    expect(s?.mean).toBe(100);
    expect(s?.sd).toBeCloseTo(1.633, 3);
    expect(s?.unstable).toBeNull();
    expect(assessStability([100, 102, 98, 100], 0.01)?.unstable).toBe(true);
    expect(assessStability([100, 100.1], 0.01)?.unstable).toBe(false);
    expect(assessStability([1])).toBeNull();
    expect(assessStability([1, Number.NaN])).toBeNull();
    expect(assessStability([0, 0], 0.1)?.unstable).toBe(true);
  });

  it('consistency check flags mismatches without replacing device values', () => {
    const good = { rawIdark: 100, rawIblank: 10100, rawIsample: 1100, absorbance: 1, concentration: 1.1875 };
    const c = checkConsistency(good, { slope: 0.8, intercept: 0.05 });
    expect(c).toMatchObject({ absorbanceMatches: true, concentrationMatches: true, issues: [] });
    expect(checkConsistency({ ...good, absorbance: 0.9 }, null).issues).toContain('absorbance_mismatch');
    expect(checkConsistency({ ...good, concentration: 2 }, { slope: 0.8, intercept: 0.05 }).issues).toContain('concentration_mismatch');
    expect(checkConsistency({ ...good, rawIsample: 50 }, null).issues).toContain('raw:sample_not_above_dark');
    expect(checkConsistency(good, { slope: 0, intercept: 0 }).issues).toContain('calibration:invalid_slope');
  });
});

describe('parseCameraValidation (UNIT, provisional vocabulary)', () => {
  it('parses known statuses and RGB', () => {
    expect(parseCameraValidation({ status: 'Disagree', rgb: { r: 10, g: 20, b: 30 } })).toEqual({
      status: 'disagree',
      rawStatus: 'Disagree',
      rgb: { r: 10, g: 20, b: 30 },
      retestSuggested: true,
    });
    expect(parseCameraValidation({ status: 'agree' }).status).toBe('agree');
    expect(parseCameraValidation({ status: 'not checked' }).status).toBe('not_checked');
  });
  it('keeps unknown statuses visible, rejects bad RGB', () => {
    expect(parseCameraValidation({ status: 'weird_new_code' })).toMatchObject({ status: 'unknown', rawStatus: 'weird_new_code' });
    expect(parseCameraValidation({ status: 'agree', rgb: { r: -1, g: 0, b: 0 } }).rgb).toBeNull();
    expect(parseCameraValidation({ status: 'agree', rgb: { r: 'x' } }).rgb).toBeNull();
    expect(parseCameraValidation(null).status).toBe('unknown');
    expect(parseCameraValidation({}).status).toBe('not_checked');
  });
});
