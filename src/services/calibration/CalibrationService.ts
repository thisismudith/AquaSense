import type { ParameterId } from '@/config/parameters';
import type { CalibrationRepository } from '@/database/repositories/CalibrationRepository';
import type { Calibration, StandardPoint, TestResult } from '@/types/domain';

import {
  classifyRange,
  computeAbsorbance,
  computeConcentration,
  type AbsorbanceError,
  type ConcentrationError,
  type RangeStatus,
  type Result,
} from '../measurement/photometry';
import { computeLodLoq, fitCalibration, type FitError, type LinearFit, type LodMethod } from './fit';

export interface Recalculation {
  resultId: string;
  calibrationId: string;
  calibrationVersion: number;
  absorbance: number;
  concentration: number;
  /** Uses the same dilution factor as the stored result. */
  finalConcentration: number;
  rangeStatus: RangeStatus;
  original: { absorbance: number | null; concentration: number | null; calibrationId: string | null };
}

export type RecalcError = AbsorbanceError | ConcentrationError | 'parameter_mismatch';

export class CalibrationService {
  constructor(
    private readonly repo: CalibrationRepository,
    private readonly lodMethod: LodMethod = null,
  ) {}

  preview(standards: readonly StandardPoint[]): Result<LinearFit & { lod: number | null; loq: number | null }, FitError> {
    const fit = fitCalibration(standards);
    if (!fit.ok) return fit;
    return { ok: true, value: { ...fit.value, ...computeLodLoq(fit.value, this.lodMethod) } };
  }

  async create(parameter: ParameterId, standards: readonly StandardPoint[], activate = true): Promise<Result<Calibration, FitError>> {
    const p = this.preview(standards);
    if (!p.ok) return p;
    const cal = await this.repo.saveNewVersion({
      parameter,
      slope: p.value.slope,
      intercept: p.value.intercept,
      rSquared: p.value.rSquared,
      lod: p.value.lod,
      loq: p.value.loq,
      standardsUsed: [...standards],
      status: activate ? 'active' : 'draft',
    });
    return { ok: true, value: cal };
  }

  /**
   * Historical recalculation from stored raw readings with a chosen calibration.
   * Pure: the stored result is never modified (specification §6).
   */
  static recalculate(result: TestResult, cal: Calibration): Result<Recalculation, RecalcError> {
    if (result.parameter !== cal.parameter) return { ok: false, error: 'parameter_mismatch' };
    const a = computeAbsorbance({ idark: result.rawIdark, iblank: result.rawIblank, isample: result.rawIsample });
    if (!a.ok) return a;
    const c = computeConcentration(a.value.absorbance, cal);
    if (!c.ok) return c;
    const xs = cal.standardsUsed.map((s) => s.concentration);
    return {
      ok: true,
      value: {
        resultId: result.resultId,
        calibrationId: cal.calibrationId,
        calibrationVersion: cal.calibrationVersion,
        absorbance: a.value.absorbance,
        concentration: c.value,
        finalConcentration: c.value * result.dilutionFactor,
        rangeStatus: classifyRange(c.value, {
          lowest: xs.length ? Math.min(...xs) : null,
          highest: xs.length ? Math.max(...xs) : null,
          lod: cal.lod,
        }),
        original: { absorbance: result.absorbance, concentration: result.concentration, calibrationId: result.calibrationId },
      },
    };
  }
}
