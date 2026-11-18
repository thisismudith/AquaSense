import { migrate } from '@/database/migrate';
import { createRepositories, type Repositories } from '@/database/repositories';
import type { NewTestResult } from '@/types/domain';

import { openNodeDatabase } from './nodeSqliteDriver';

export async function createTestRepos(): Promise<Repositories> {
  const db = openNodeDatabase();
  await migrate(db);
  return createRepositories(db);
}

export function makeResult(over: Partial<NewTestResult> = {}): NewTestResult {
  return {
    deviceTestId: 'T-0001',
    deviceId: 'dev-1',
    sampleId: null,
    parameter: 'nitrite',
    rawIdark: 100,
    rawIblank: 20000,
    rawIsample: 15000,
    absorbance: 0.1235,
    concentration: 0.21,
    cameraRgb: { r: 200, g: 120, b: 180 },
    cameraValidationStatus: 'agree',
    retestRequired: false,
    measurementQualityStatus: 'ok',
    deviceWarnings: [],
    calibrationId: null,
    deviceCalibrationMeta: null,
    firmwareVersion: '1.0.0',
    deviceTimestamp: '2026-11-19T10:00:00.000Z',
    phoneTimestamp: '2026-11-19T10:00:01.000Z',
    ...over,
  };
}
