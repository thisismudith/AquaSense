import { openExpoDatabase } from '@/database/expoSqliteDriver';
import { setLanguage } from '@/i18n';
import { useAppStore } from '@/store/appStore';

import { createTransport } from './bluetooth/transportFactory';
import { createServices, type ContainerDeps } from './container';
import { createExpoFileStore } from './storage/ExpoFileStore';

let booting: Promise<void> | null = null;

export const productionDeps: ContainerDeps = {
  openDatabase: () => openExpoDatabase(),
  fileStore: createExpoFileStore,
  transport: createTransport,
};

/** Initialises DB, services and BLE once; mirrors BLE state into the store. Safe to call repeatedly. */
export function bootApp(deps: ContainerDeps = productionDeps): Promise<void> {
  if (booting) return booting;
  booting = (async () => {
    try {
      const services = await createServices(deps);
      const settings = await services.repos.settings.getAll();
      setLanguage(settings.language);
      useAppStore.getState().setBooted(services, settings);
      services.ble?.subscribe((s) => useAppStore.getState().setBle(s));
      services.ble?.onResult(() => useAppStore.getState().touchData());
      // Housekeeping: remove photo files no sample references (e.g. after a crash mid-replace).
      services.photos.cleanupOrphans().catch((e: unknown) => console.warn('[boot] photo cleanup failed', e));
    } catch (e) {
      booting = null;
      useAppStore.getState().setBootError(e instanceof Error ? e.message : String(e));
    }
  })();
  return booting;
}

export function resetBootForTests(): void {
  booting = null;
}
