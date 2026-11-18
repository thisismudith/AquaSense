import type { Database } from '../types';
import { CalibrationRepository } from './CalibrationRepository';
import { DeviceRepository } from './DeviceRepository';
import { ReagentRepository } from './ReagentRepository';
import { SampleRepository } from './SampleRepository';
import { SettingsRepository } from './SettingsRepository';
import { TestResultRepository } from './TestResultRepository';
import { TimerRepository } from './TimerRepository';

export interface Repositories {
  db: Database;
  samples: SampleRepository;
  results: TestResultRepository;
  calibrations: CalibrationRepository;
  reagents: ReagentRepository;
  devices: DeviceRepository;
  settings: SettingsRepository;
  timers: TimerRepository;
}

export function createRepositories(db: Database): Repositories {
  return {
    db,
    samples: new SampleRepository(db),
    results: new TestResultRepository(db),
    calibrations: new CalibrationRepository(db),
    reagents: new ReagentRepository(db),
    devices: new DeviceRepository(db),
    settings: new SettingsRepository(db),
    timers: new TimerRepository(db),
  };
}

export {
  CalibrationRepository,
  DeviceRepository,
  ReagentRepository,
  SampleRepository,
  SettingsRepository,
  TestResultRepository,
  TimerRepository,
};
