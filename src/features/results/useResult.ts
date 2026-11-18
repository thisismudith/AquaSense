import { useLocalSearchParams } from 'expo-router';

import { useAsync } from '@/hooks/useAsync';
import { useServices } from '@/store/appStore';
import type { Calibration, Sample, TestResult } from '@/types/domain';

export interface ResultBundle {
  result: TestResult;
  sample: Sample | null;
  calibration: Calibration | null;
}

/** Loads a result with its sample and the calibration record it was measured with. */
export function useResultBundle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repos } = useServices();
  const state = useAsync<ResultBundle | null>(async () => {
    if (!id) return null;
    const result = await repos.results.getById(id);
    if (!result) return null;
    return {
      result,
      sample: result.sampleId ? await repos.samples.getById(result.sampleId) : null,
      calibration: result.calibrationId ? await repos.calibrations.getById(result.calibrationId) : null,
    };
  }, [repos, id]);
  return { id, ...state };
}
