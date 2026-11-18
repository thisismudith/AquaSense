import type { Repositories } from '@/database/repositories';
import { BackupService, BACKUP_VERSION } from '@/services/backup/BackupService';
import { PhotoStorage } from '@/services/camera/PhotoStorage';

import { createTestRepos, makeResult } from '../helpers/db';
import { createMemoryFileStore } from '../helpers/memoryFileStore';

let r: Repositories;
let fs: ReturnType<typeof createMemoryFileStore>;
let photos: PhotoStorage;
const picked = 'content://media/picker/IMG_1.JPG';

beforeEach(async () => {
  r = await createTestRepos();
  fs = createMemoryFileStore();
  photos = new PhotoStorage(fs, r.samples);
  fs.files.set(picked, Buffer.from('jpegdata').toString('base64'));
});
afterEach(() => r.db.close());

const newSample = () => r.samples.create({ sampleName: 'Pond', sourceType: 'pond', notes: null, photoPath: null, location: null });

describe('PhotoStorage (UNIT/NODE, in-memory FS)', () => {
  it('copies into private storage, replaces and removes safely', async () => {
    const s = await newSample();
    const first = await photos.setSamplePhoto(s.sampleId, picked);
    expect(first.startsWith(`${photos.dir}/`)).toBe(true);
    expect(first.endsWith('.jpg')).toBe(true);
    expect(fs.files.has(picked)).toBe(true); // gallery original untouched
    const second = await photos.setSamplePhoto(s.sampleId, picked);
    expect(fs.files.has(first)).toBe(false);
    expect(fs.files.has(second)).toBe(true);
    await photos.removeSamplePhoto(s.sampleId);
    expect(fs.files.has(second)).toBe(false);
    expect((await r.samples.getById(s.sampleId))?.photoPath).toBeNull();
  });

  it('reports missing files', async () => {
    const s = await newSample();
    const uri = await photos.setSamplePhoto(s.sampleId, picked);
    fs.files.delete(uri);
    expect(await photos.status(uri)).toEqual({ kind: 'missing', uri });
    expect(await photos.status(null)).toEqual({ kind: 'none' });
  });

  it('never deletes files outside the managed directory', async () => {
    const s = await r.samples.create({ sampleName: 'X', sourceType: 'tap', notes: null, photoPath: picked, location: null });
    await photos.removeSamplePhoto(s.sampleId);
    expect(fs.files.has(picked)).toBe(true);
  });

  it('deletes sample photo with the sample, and cleans orphans', async () => {
    const s = await newSample();
    const uri = await photos.setSamplePhoto(s.sampleId, picked);
    const orphan = `${photos.dir}/orphan.jpg`;
    fs.files.set(orphan, 'x');
    expect(await photos.cleanupOrphans()).toEqual(['orphan.jpg']);
    expect(fs.files.has(uri)).toBe(true);
    await photos.deleteSample(s.sampleId);
    expect(fs.files.has(uri)).toBe(false);
  });

  it('import failure for missing source leaves sample unchanged', async () => {
    const s = await newSample();
    await expect(photos.setSamplePhoto(s.sampleId, 'content://gone')).rejects.toThrow(/ENOENT/);
    expect((await r.samples.getById(s.sampleId))?.photoPath).toBeNull();
  });
});

describe('BackupService (UNIT/NODE)', () => {
  async function seed() {
    await r.devices.upsert({ deviceId: 'dev-1', deviceName: 'ESP32-A', firmwareVersion: '1.0.0' });
    const s = await newSample();
    await photos.setSamplePhoto(s.sampleId, picked);
    const c = await r.calibrations.saveNewVersion({ parameter: 'nitrite', slope: 1.2, intercept: 0.002, rSquared: 0.998, lod: null, loq: null, standardsUsed: [{ concentration: 0, absorbance: 0 }, { concentration: 0.5, absorbance: 0.6 }], status: 'active' });
    await r.results.insert(makeResult({ sampleId: s.sampleId, calibrationId: c.calibrationId }));
    await r.reagents.create({ parameter: 'nitrite', reagentName: 'NED', quantityRemaining: 5, quantityUnit: 'mL', quantityPerTest: 1, lowStockThreshold: 2, expiryDate: '2027-01-01', batchNumber: null });
    await r.settings.set('theme', 'dark');
    await r.devices.updateSyncMetadata({ deviceId: 'dev-1', lastSyncTimestamp: '2026-11-19T10:00:00.000Z', lastSyncedDeviceResultId: 'T-0001', pendingSyncRecords: 0 });
  }

  it('round-trips everything into an empty database including photos', async () => {
    await seed();
    const svc = new BackupService(r, fs, photos.dir);
    const backup = await svc.createBackup();
    const text = JSON.stringify(backup);

    const r2 = await createTestRepos();
    const fs2 = createMemoryFileStore();
    const photos2 = new PhotoStorage(fs2, r2.samples);
    const v = BackupService.validate(text);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    const rep = await new BackupService(r2, fs2, photos2.dir).restore(v.backup);
    expect(rep.inserted).toEqual({ devices: 1, samples: 1, calibrations: 1, results: 1, reagents: 1, syncMetadata: 1, settings: 1, photos: 1 });
    expect(rep.conflicts).toEqual([]);
    const s2 = (await r2.samples.list())[0];
    expect(s2?.photoPath && (await photos2.status(s2.photoPath)).kind).toBe('ok');
    expect(await r2.settings.get('theme')).toBe('dark');
    expect((await r2.results.list())[0]?.concentration).toBe(0.21);
    await r2.db.close();
  });

  it('restoring into the same database is a no-op (identical skipped, nothing overwritten)', async () => {
    await seed();
    const svc = new BackupService(r, fs, photos.dir);
    const backup = await svc.createBackup();
    const rep = await svc.restore(backup);
    expect(Object.values(rep.inserted).every((n) => n === 0)).toBe(true);
    expect(rep.conflicts).toEqual([]);
    expect(rep.skippedIdentical).toBeGreaterThanOrEqual(7);
  });

  it('reports conflicts and keeps existing records', async () => {
    await seed();
    const svc = new BackupService(r, fs, photos.dir);
    const backup = await svc.createBackup();
    await r.settings.set('theme', 'light');
    const [res] = await r.results.list();
    await r.results.setDilution(res!.resultId, 2);
    const rep = await svc.restore(backup);
    expect(rep.conflicts.map((c) => c.table).sort()).toEqual(['results', 'settings']);
    expect(await r.settings.get('theme')).toBe('light');
    expect((await r.results.getById(res!.resultId))?.dilutionFactor).toBe(2);
  });

  it('detects duplicate device test with different result id', async () => {
    await seed();
    const svc = new BackupService(r, fs, photos.dir);
    const backup = await svc.createBackup();
    backup.data.results[0]!.resultId = 'other-id';
    const rep = await svc.restore(backup);
    expect(rep.conflicts).toEqual([expect.objectContaining({ table: 'results', id: 'other-id' })]);
    expect(await r.results.count()).toBe(1);
  });

  it('drops dangling photo paths when the file is missing at backup time', async () => {
    await seed();
    const s = (await r.samples.list())[0]!;
    fs.files.delete(s.photoPath!);
    const backup = await new BackupService(r, fs, photos.dir).createBackup();
    expect(backup.photos).toEqual([]);
    expect(backup.data.samples[0]?.photoPath).toBeNull();
  });

  it('rejects invalid json, wrong format, incompatible version, bad content', () => {
    expect(BackupService.validate('{nope')).toMatchObject({ ok: false, reason: 'invalid_json' });
    expect(BackupService.validate('{"format":"other","version":1}')).toMatchObject({ ok: false, reason: 'wrong_format' });
    expect(BackupService.validate(JSON.stringify({ format: 'aquasense-backup', version: BACKUP_VERSION + 1 }))).toMatchObject({ ok: false, reason: 'incompatible_version' });
    expect(BackupService.validate(JSON.stringify({ format: 'aquasense-backup', version: BACKUP_VERSION, data: {} }))).toMatchObject({ ok: false, reason: 'invalid_content' });
  });

  it('rejects unsafe photo file names (path traversal) and invalid settings', async () => {
    await seed();
    const b = await new BackupService(r, fs, photos.dir).createBackup();
    const evil = { ...b, photos: [{ fileName: '../../evil.sh', base64: 'eA==' }] };
    expect(BackupService.validate(JSON.stringify(evil))).toMatchObject({ ok: false, reason: 'invalid_content' });
    const badSetting = { ...b, data: { ...b.data, settings: [{ key: 'theme', value: '"neon"' }] } };
    expect(BackupService.validate(JSON.stringify(badSetting))).toMatchObject({ ok: false, reason: 'invalid_content' });
  });

  it('rolls back the whole DB restore on failure', async () => {
    await seed();
    const backup = await new BackupService(r, fs, photos.dir).createBackup();
    const r2 = await createTestRepos();
    const spy = jest.spyOn(r2.reagents, 'insertRaw').mockRejectedValue(new Error('disk I/O'));
    await expect(new BackupService(r2, createMemoryFileStore(), 'file:///x/photos').restore(backup)).rejects.toThrow('disk I/O');
    expect(await r2.samples.list()).toEqual([]);
    expect(await r2.devices.list()).toEqual([]);
    spy.mockRestore();
    await r2.db.close();
  });
});
