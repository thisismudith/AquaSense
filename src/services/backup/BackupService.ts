import { z } from 'zod';

import { currentSchemaVersion } from '@/database/migrate';
import type { Repositories } from '@/database/repositories';
import { AppSettingsSchema } from '@/database/repositories/SettingsRepository';
import {
  CalibrationSchema,
  DeviceSchema,
  ReagentSchema,
  SampleSchema,
  SyncMetadataSchema,
  TestResultSchema,
  type Calibration,
  type Sample,
} from '@/types/domain';
import { nowIso } from '@/utils/id';

import { fileName, type FileStore } from '../storage/FileStore';

export const BACKUP_FORMAT = 'aquasense-backup';
export const BACKUP_VERSION = 1;

const PhotoEntrySchema = z.object({
  fileName: z.string().regex(/^[A-Za-z0-9._-]{1,128}$/, 'unsafe photo file name'),
  base64: z.string(),
});

export const BackupSchema = z.object({
  format: z.literal(BACKUP_FORMAT),
  version: z.number().int(),
  createdAt: z.string(),
  schemaVersion: z.number().int(),
  data: z.object({
    devices: z.array(DeviceSchema),
    samples: z.array(SampleSchema),
    calibrations: z.array(CalibrationSchema),
    results: z.array(TestResultSchema),
    reagents: z.array(ReagentSchema),
    syncMetadata: z.array(SyncMetadataSchema),
    settings: z.array(z.object({ key: z.string(), value: z.string() })),
  }),
  photos: z.array(PhotoEntrySchema),
});
export type Backup = z.infer<typeof BackupSchema>;

export type BackupValidation =
  | { ok: true; backup: Backup }
  | { ok: false; reason: 'invalid_json' | 'wrong_format' | 'incompatible_version' | 'invalid_content'; detail: string };

export interface RestoreReport {
  inserted: Record<'devices' | 'samples' | 'calibrations' | 'results' | 'reagents' | 'syncMetadata' | 'settings' | 'photos', number>;
  skippedIdentical: number;
  conflicts: { table: string; id: string; reason: string }[];
  warnings: string[];
}

function stable(v: unknown): string {
  return JSON.stringify(v, (_k, val: unknown) =>
    val && typeof val === 'object' && !Array.isArray(val)
      ? Object.fromEntries(Object.entries(val as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)))
      : val,
  );
}

export class BackupService {
  constructor(
    private readonly repos: Repositories,
    private readonly fs: FileStore,
    private readonly photoDir: string,
  ) {}

  async createBackup(): Promise<Backup> {
    const samples = await this.repos.samples.list({ limit: 1_000_000 });
    const photos: Backup['photos'] = [];
    const portableSamples: Sample[] = [];
    for (const s of samples) {
      if (s.photoPath && (await this.fs.exists(s.photoPath))) {
        photos.push({ fileName: fileName(s.photoPath), base64: await this.fs.readBase64(s.photoPath) });
        portableSamples.push({ ...s, photoPath: fileName(s.photoPath) });
      } else {
        // Missing photo file: keep the sample, drop the dangling path.
        portableSamples.push({ ...s, photoPath: null });
      }
    }
    const devices = await this.repos.devices.list();
    const syncMetadata = [];
    for (const d of devices) {
      if (await this.repos.devices.hasSyncMetadata(d.deviceId)) syncMetadata.push(await this.repos.devices.getSyncMetadata(d.deviceId));
    }
    return BackupSchema.parse({
      format: BACKUP_FORMAT,
      version: BACKUP_VERSION,
      createdAt: nowIso(),
      schemaVersion: await currentSchemaVersion(this.repos.db),
      data: {
        devices,
        samples: portableSamples,
        calibrations: await this.repos.calibrations.list(),
        results: await this.repos.results.list({ limit: 1_000_000 }),
        reagents: await this.repos.reagents.list(),
        syncMetadata,
        settings: await this.repos.settings.rawEntries(),
      },
      photos,
    });
  }

  static validate(text: string): BackupValidation {
    let json: unknown;
    try {
      json = JSON.parse(text);
    } catch (e) {
      return { ok: false, reason: 'invalid_json', detail: e instanceof Error ? e.message : String(e) };
    }
    const head = z.object({ format: z.string(), version: z.number() }).safeParse(json);
    if (!head.success || head.data.format !== BACKUP_FORMAT) return { ok: false, reason: 'wrong_format', detail: 'Not an AquaSense backup file' };
    if (head.data.version !== BACKUP_VERSION) {
      return { ok: false, reason: 'incompatible_version', detail: `Backup version ${head.data.version} is not supported (expected ${BACKUP_VERSION})` };
    }
    const full = BackupSchema.safeParse(json);
    if (!full.success) return { ok: false, reason: 'invalid_content', detail: full.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
    for (const s of full.data.data.settings) {
      const key = s.key as keyof typeof AppSettingsSchema.shape;
      const shape = AppSettingsSchema.shape[key];
      let parsed: unknown;
      try {
        parsed = JSON.parse(s.value);
      } catch {
        return { ok: false, reason: 'invalid_content', detail: `settings.${s.key}: invalid JSON` };
      }
      if (!shape || !shape.safeParse(parsed).success) return { ok: false, reason: 'invalid_content', detail: `settings.${s.key}: invalid value` };
    }
    return { ok: true, backup: full.data };
  }

  /**
   * Restores additively. Existing records are never overwritten: identical records are skipped,
   * differing records with the same ID (or same device test ID) are reported as conflicts.
   * All DB writes happen in one transaction; photos are written afterwards.
   */
  async restore(backup: Backup): Promise<RestoreReport> {
    const r = this.repos;
    const report: RestoreReport = {
      inserted: { devices: 0, samples: 0, calibrations: 0, results: 0, reagents: 0, syncMetadata: 0, settings: 0, photos: 0 },
      skippedIdentical: 0,
      conflicts: [],
      warnings: [],
    };
    const photosToWrite = new Map<string, string>();
    const photoByName = new Map(backup.photos.map((p) => [p.fileName, p.base64]));

    await r.db.transaction(async () => {
      const handle = async <T>(table: keyof RestoreReport['inserted'], id: string, incoming: T, existing: T | null, insert: () => Promise<void>) => {
        if (existing === null) {
          await insert();
          report.inserted[table] += 1;
          return true;
        }
        if (stable(existing) === stable(incoming)) report.skippedIdentical += 1;
        else report.conflicts.push({ table, id, reason: 'A different record with this ID already exists; kept the existing one' });
        return false;
      };

      for (const d of backup.data.devices) await handle('devices', d.deviceId, d, await r.devices.getById(d.deviceId), () => r.devices.insertRaw(d));

      for (const s of backup.data.samples) {
        const local = s.photoPath ? { ...s, photoPath: this.fs.join(this.photoDir, s.photoPath) } : s;
        if (s.photoPath && !photoByName.has(s.photoPath)) {
          report.warnings.push(`Photo for sample ${s.sampleName} missing from backup`);
          local.photoPath = null;
        }
        const existing = await r.samples.getById(s.sampleId);
        const inserted = await handle('samples', s.sampleId, local, existing, () => r.samples.insertRaw(local));
        if (inserted && s.photoPath && local.photoPath) photosToWrite.set(local.photoPath, photoByName.get(s.photoPath) ?? '');
      }

      for (const c of backup.data.calibrations) {
        const existing = await r.calibrations.getById(c.calibrationId);
        if (!existing) {
          const sameVersion = (await r.calibrations.list(c.parameter)).find((x) => x.calibrationVersion === c.calibrationVersion);
          if (sameVersion) {
            report.conflicts.push({ table: 'calibrations', id: c.calibrationId, reason: `Version ${c.calibrationVersion} of ${c.parameter} already exists` });
            continue;
          }
        }
        let toInsert: Calibration = c;
        if (!existing && c.calibrationStatus === 'active' && (await r.calibrations.getActive(c.parameter))) {
          toInsert = { ...c, calibrationStatus: 'superseded' };
          report.warnings.push(`Restored ${c.parameter} calibration v${c.calibrationVersion} as superseded; current active calibration kept`);
        }
        await handle('calibrations', c.calibrationId, c, existing, () => r.calibrations.insertRaw(toInsert));
      }

      for (const t of backup.data.results) {
        const byId = await r.results.getById(t.resultId);
        if (!byId) {
          const dup = await r.results.findByDeviceTestId(t.deviceId, t.deviceTestId);
          if (dup) {
            report.conflicts.push({ table: 'results', id: t.resultId, reason: `Device test ${t.deviceTestId} already stored` });
            continue;
          }
          if (t.sampleId && !(await r.samples.getById(t.sampleId))) {
            report.warnings.push(`Result ${t.deviceTestId}: sample not found, restored without sample link`);
            t.sampleId = null;
          }
          if (t.calibrationId && !(await r.calibrations.getById(t.calibrationId))) {
            report.conflicts.push({ table: 'results', id: t.resultId, reason: 'Referenced calibration not available' });
            continue;
          }
        }
        await handle('results', t.resultId, t, byId, () => r.results.insertRaw(t));
      }

      for (const g of backup.data.reagents) await handle('reagents', g.reagentId, g, await r.reagents.getById(g.reagentId), () => r.reagents.insertRaw(g));

      for (const m of backup.data.syncMetadata) {
        const has = await r.devices.hasSyncMetadata(m.deviceId);
        await handle('syncMetadata', m.deviceId, m, has ? await r.devices.getSyncMetadata(m.deviceId) : null, () => r.devices.updateSyncMetadataRaw(m));
      }

      for (const s of backup.data.settings) {
        await handle('settings', s.key, s.value, await r.settings.getRaw(s.key), () => r.settings.insertRaw(s.key, s.value));
      }
    });

    if (photosToWrite.size) await this.fs.ensureDir(this.photoDir);
    for (const [uri, data] of photosToWrite) {
      try {
        if (!(await this.fs.exists(uri))) await this.fs.writeBase64(uri, data);
        report.inserted.photos += 1;
      } catch (e) {
        report.warnings.push(`Could not write photo ${fileName(uri)}: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return report;
  }
}
