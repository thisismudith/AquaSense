import { migrate } from '@/database/migrate';
import { createRepositories, type Repositories } from '@/database/repositories';
import type { Database } from '@/database/types';

import { BackupService } from './backup/BackupService';
import { BLEManager } from './bluetooth/BLEManager';
import type { BleTransport } from './bluetooth/BLETypes';
import { CalibrationService } from './calibration/CalibrationService';
import { PhotoStorage } from './camera/PhotoStorage';
import { TimerService } from './notifications/TimerService';
import { requestBluetooth } from './permissions/permissions';
import type { FileStore } from './storage/FileStore';

export interface Services {
  repos: Repositories;
  fs: FileStore;
  photos: PhotoStorage;
  backup: BackupService;
  calibration: CalibrationService;
  timers: TimerService;
  ble: BLEManager | null;
  transportKind: 'native' | 'mock' | 'unavailable';
}

export interface ContainerDeps {
  openDatabase: () => Promise<Database>;
  fileStore: () => FileStore;
  transport: () => BleTransport | null;
  timerService?: (repos: Repositories) => TimerService;
  ensureBlePermissions?: () => ReturnType<typeof requestBluetooth>;
}

/** Composition root. Keeps native wiring in one place so screens only see typed services. */
export async function createServices(deps: ContainerDeps): Promise<Services> {
  const db = await deps.openDatabase();
  await migrate(db);
  const repos = createRepositories(db);
  const fs = deps.fileStore();
  const photos = new PhotoStorage(fs, repos.samples);
  const transport = deps.transport();
  let ble: BLEManager | null = null;
  if (transport) {
    ble = new BLEManager({
      transport,
      repos,
      ensurePermissions: deps.ensureBlePermissions ?? (() => requestBluetooth()),
      autoSync: async () => (await repos.settings.get('devicePreferences')).autoSync,
    });
    await ble.init();
  }
  return {
    repos,
    fs,
    photos,
    backup: new BackupService(repos, fs, photos.dir),
    calibration: new CalibrationService(repos.calibrations),
    timers: deps.timerService?.(repos) ?? new TimerService(repos.timers),
    ble,
    transportKind: transport ? transport.kind : 'unavailable',
  };
}
