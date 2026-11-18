import { z } from 'zod';

import type { Database } from '../types';
import { CorruptColumnError } from './json';

export const AppSettingsSchema = z.object({
  units: z.enum(['mg/L', 'µg/L']),
  language: z.enum(['en']),
  theme: z.enum(['light', 'dark', 'system']),
  notificationPreferences: z.object({ timerAlerts: z.boolean(), vibration: z.boolean() }),
  devicePreferences: z.object({
    autoReconnect: z.boolean(),
    autoSync: z.boolean(),
    preferredDeviceId: z.string().nullable(),
  }),
  onboardingComplete: z.boolean(),
});
export type AppSettings = z.infer<typeof AppSettingsSchema>;
export type SettingKey = keyof AppSettings;

export const DEFAULT_SETTINGS: AppSettings = {
  units: 'mg/L',
  language: 'en',
  theme: 'light',
  notificationPreferences: { timerAlerts: true, vibration: true },
  devicePreferences: { autoReconnect: true, autoSync: true, preferredDeviceId: null },
  onboardingComplete: false,
};

export class SettingsRepository {
  constructor(private readonly db: Database) {}

  async get<K extends SettingKey>(key: K): Promise<AppSettings[K]> {
    const row = await this.db.get<{ value: string }>('SELECT value FROM settings WHERE key=?', [key]);
    if (!row) return DEFAULT_SETTINGS[key];
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.value);
    } catch (e) {
      throw new CorruptColumnError(`settings.${key}`, e);
    }
    const res = AppSettingsSchema.shape[key].safeParse(parsed);
    if (!res.success) throw new CorruptColumnError(`settings.${key}`, res.error);
    return res.data as AppSettings[K];
  }

  async getAll(): Promise<AppSettings> {
    const out = { ...DEFAULT_SETTINGS };
    for (const k of Object.keys(DEFAULT_SETTINGS) as SettingKey[]) {
      (out as Record<SettingKey, unknown>)[k] = await this.get(k);
    }
    return out;
  }

  async set<K extends SettingKey>(key: K, value: AppSettings[K]): Promise<void> {
    const v = AppSettingsSchema.shape[key].parse(value);
    await this.db.run('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [
      key,
      JSON.stringify(v),
    ]);
  }

  async rawEntries(): Promise<{ key: string; value: string }[]> {
    return this.db.all('SELECT key, value FROM settings ORDER BY key');
  }

  async getRaw(key: string): Promise<string | null> {
    return (await this.db.get<{ value: string }>('SELECT value FROM settings WHERE key=?', [key]))?.value ?? null;
  }

  /** Inserts a raw (already validated) entry; fails if the key exists. Used by restore. */
  async insertRaw(key: string, value: string): Promise<void> {
    await this.db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [key, value]);
  }
}
