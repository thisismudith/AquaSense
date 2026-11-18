import { create } from 'zustand';

import { DEFAULT_SETTINGS, type AppSettings, type SettingKey } from '@/database/repositories/SettingsRepository';
import type { BleSnapshot } from '@/services/bluetooth/BLEManager';
import type { Services } from '@/services/container';

type BootStatus = 'booting' | 'ready' | 'error';

interface AppState {
  status: BootStatus;
  bootError: string | null;
  services: Services | null;
  settings: AppSettings;
  ble: BleSnapshot | null;
  /** Bumps whenever results/samples/reagents change so lists refetch. */
  dataVersion: number;
  setBooted: (services: Services, settings: AppSettings) => void;
  setBootError: (msg: string) => void;
  setBle: (s: BleSnapshot) => void;
  updateSetting: <K extends SettingKey>(key: K, value: AppSettings[K]) => Promise<void>;
  touchData: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  status: 'booting',
  bootError: null,
  services: null,
  settings: DEFAULT_SETTINGS,
  ble: null,
  dataVersion: 0,
  setBooted: (services, settings) => set({ services, settings, status: 'ready', bootError: null }),
  setBootError: (msg) => set({ status: 'error', bootError: msg }),
  setBle: (ble) => set({ ble }),
  updateSetting: async (key, value) => {
    const svc = get().services;
    if (!svc) throw new Error('App not ready');
    await svc.repos.settings.set(key, value);
    set({ settings: { ...get().settings, [key]: value } });
  },
  touchData: () => set({ dataVersion: get().dataVersion + 1 }),
}));

/** Non-null services for screens rendered after boot. */
export function useServices(): Services {
  const s = useAppStore((st) => st.services);
  if (!s) throw new Error('Services not initialised');
  return s;
}
