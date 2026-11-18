import { CalibrationService } from '@/services/calibration/CalibrationService';
import { computeLodLoq, fitCalibration } from '@/services/calibration/fit';

import { createTestRepos, makeResult } from '../helpers/db';

describe('fitCalibration (UNIT)', () => {
  it('exact line gives R² = 1', () => {
    const pts = [0, 0.25, 0.5, 0.75, 1].map((c) => ({ concentration: c, absorbance: 0.8 * c + 0.05 }));
    const f = fitCalibration(pts);
    expect(f.ok).toBe(true);
    if (!f.ok) return;
    expect(f.value.slope).toBeCloseTo(0.8, 12);
    expect(f.value.intercept).toBeCloseTo(0.05, 12);
    expect(f.value.rSquared).toBeCloseTo(1, 12);
    expect(f.value.residualSd).toBeCloseTo(0, 12);
    expect([f.value.minConcentration, f.value.maxConcentration]).toEqual([0, 1]);
  });

  it('matches a known noisy dataset (reference: numpy.polyfit → m=0.195, c=0.016, R²=0.998241)', () => {
    // x = [0,1,2,3,4], y = [0.02, 0.21, 0.39, 0.62, 0.79]
    const pts = [0.02, 0.21, 0.39, 0.62, 0.79].map((a, i) => ({ concentration: i, absorbance: a }));
    const f = fitCalibration(pts);
    if (!f.ok) throw new Error(f.error);
    expect(f.value.slope).toBeCloseTo(0.195, 10);
    expect(f.value.intercept).toBeCloseTo(0.016, 10);
    expect(f.value.rSquared).toBeCloseTo(0.9982411, 6);
    expect(f.value.n).toBe(5);
  });

  it.each([
    [[{ concentration: 1, absorbance: 0.1 }], 'too_few_standards'],
    [[], 'too_few_standards'],
    [[{ concentration: 1, absorbance: 0.1 }, { concentration: 1, absorbance: 0.2 }], 'identical_concentrations'],
    [[{ concentration: 0, absorbance: 0.1 }, { concentration: 1, absorbance: 0.1 }], 'zero_slope'],
    [[{ concentration: 0, absorbance: Number.NaN }, { concentration: 1, absorbance: 0.1 }], 'non_finite_value'],
    [[{ concentration: Number.POSITIVE_INFINITY, absorbance: 0 }, { concentration: 1, absorbance: 0.1 }], 'non_finite_value'],
    [[{ concentration: -1, absorbance: 0 }, { concentration: 1, absorbance: 0.1 }], 'negative_concentration'],
  ])('rejects %o → %s', (pts, error) => {
    expect(fitCalibration(pts)).toEqual({ ok: false, error });
  });

  it('two standards: R² = 1, no residual SD', () => {
    const f = fitCalibration([{ concentration: 0, absorbance: 0 }, { concentration: 1, absorbance: 0.5 }]);
    expect(f.ok && f.value.residualSd).toBeNull();
  });

  it('LOD/LOQ not computed unless method confirmed', () => {
    const f = fitCalibration([0.02, 0.21, 0.39, 0.62, 0.79].map((a, i) => ({ concentration: i, absorbance: a })));
    if (!f.ok) throw new Error();
    expect(computeLodLoq(f.value)).toEqual({ lod: null, loq: null });
    const r = computeLodLoq(f.value, 'residual_sd');
    expect(r.lod).toBeCloseTo((3.3 * (f.value.residualSd ?? 0)) / 0.195, 10);
    expect(r.loq).toBeCloseTo((10 * (f.value.residualSd ?? 0)) / 0.195, 10);
  });
});

describe('CalibrationService (UNIT/NODE)', () => {
  const standards = [0, 0.1, 0.25, 0.5].map((c) => ({ concentration: c, absorbance: 1.2 * c + 0.002 }));

  it('creates versioned active calibrations and refuses invalid sets without writing', async () => {
    const r = await createTestRepos();
    const svc = new CalibrationService(r.calibrations);
    const bad = await svc.create('nitrite', [standards[0]!]);
    expect(bad).toEqual({ ok: false, error: 'too_few_standards' });
    expect(await r.calibrations.list()).toEqual([]);
    const a = await svc.create('nitrite', standards);
    const b = await svc.create('nitrite', standards);
    expect(a.ok && b.ok && [a.value.calibrationVersion, b.value.calibrationVersion]).toEqual([1, 2]);
    expect((await r.calibrations.getActive('nitrite'))?.calibrationVersion).toBe(2);
    await r.db.close();
  });

  it('recalculates historically without mutating the stored result', async () => {
    const r = await createTestRepos();
    await r.devices.upsert({ deviceId: 'dev-1', deviceName: 'A' });
    const svc = new CalibrationService(r.calibrations);
    const c1 = await svc.create('nitrite', standards);
    if (!c1.ok) throw new Error();
    // raw: Ib−Id = 10000, Is−Id = 5000 → A = log10(2) = 0.30103
    const ins = await r.results.insert(makeResult({ rawIdark: 0, rawIblank: 10000, rawIsample: 5000, absorbance: 0.30103, concentration: 0.2492, calibrationId: c1.value.calibrationId, dilutionFactor: 2 }));
    if (!ins.inserted) throw new Error();
    const newer = await svc.create('nitrite', standards.map((s) => ({ ...s, absorbance: s.absorbance * 1.1 })));
    if (!newer.ok) throw new Error();
    const rc = CalibrationService.recalculate(ins.result, newer.value);
    expect(rc.ok).toBe(true);
    if (!rc.ok) return;
    expect(rc.value.absorbance).toBeCloseTo(Math.log10(2), 10);
    expect(rc.value.concentration).toBeCloseTo((Math.log10(2) - newer.value.intercept) / newer.value.slope, 10);
    expect(rc.value.finalConcentration).toBeCloseTo(rc.value.concentration * 2, 10);
    expect(rc.value.rangeStatus).toBe('in_range');
    expect(rc.value.original.calibrationId).toBe(c1.value.calibrationId);
    const stored = await r.results.getById(ins.result.resultId);
    expect(stored).toEqual(ins.result);
    await r.db.close();
  });

  it('recalc errors: parameter mismatch, missing raw values', async () => {
    const r = await createTestRepos();
    await r.devices.upsert({ deviceId: 'dev-1', deviceName: 'A' });
    const svc = new CalibrationService(r.calibrations);
    const c = await svc.create('cr6', standards);
    if (!c.ok) throw new Error();
    const ins = await r.results.insert(makeResult({ parameter: 'nitrite' }));
    if (!ins.inserted) throw new Error();
    expect(CalibrationService.recalculate(ins.result, c.value)).toEqual({ ok: false, error: 'parameter_mismatch' });
    expect(CalibrationService.recalculate({ ...ins.result, parameter: 'cr6', rawIdark: null }, c.value)).toMatchObject({ ok: false, error: 'missing_input' });
    await r.db.close();
  });
});
