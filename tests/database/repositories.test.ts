import type { Repositories } from '@/database/repositories';
import { CorruptColumnError } from '@/database/repositories/json';
import {
  daysUntilExpiry,
  estimateTestsRemaining,
  ExpiredReagentError,
  InsufficientReagentError,
  isExpired,
  isLowStock,
} from '@/database/repositories/ReagentRepository';
import { DEFAULT_SETTINGS } from '@/database/repositories/SettingsRepository';
import { computeFinalConcentration } from '@/database/repositories/TestResultRepository';

import { createTestRepos, makeResult } from '../helpers/db';

let r: Repositories;
beforeEach(async () => {
  r = await createTestRepos();
  await r.devices.upsert({ deviceId: 'dev-1', deviceName: 'ESP32-A' });
});
afterEach(() => r.db.close());

describe('SampleRepository (UNIT/NODE)', () => {
  const base = { sampleName: 'Well 3', sourceType: 'well' as const, notes: 'near pump', photoPath: null, location: null };

  it('creates, reads, updates, deletes', async () => {
    const s = await r.samples.create(base);
    expect(await r.samples.getById(s.sampleId)).toEqual(s);
    const u = await r.samples.update(s.sampleId, {
      location: { latitude: 12.97, longitude: 77.59, accuracy: 8, timestamp: '2026-11-19T10:00:00.000Z' },
    });
    expect((await r.samples.getById(s.sampleId))?.location).toEqual(u.location);
    expect(await r.samples.delete(s.sampleId)).toBe(true);
    expect(await r.samples.getById(s.sampleId)).toBeNull();
  });

  it('rejects empty names and invalid source type', async () => {
    await expect(r.samples.create({ ...base, sampleName: '   ' })).rejects.toThrow();
    await expect(r.samples.create({ ...base, sourceType: 'ocean' as never })).rejects.toThrow();
  });

  it('searches by name/notes and escapes LIKE wildcards', async () => {
    await r.samples.create(base);
    await r.samples.create({ ...base, sampleName: 'River_A', notes: null });
    expect((await r.samples.list({ search: 'pump' })).map((s) => s.sampleName)).toEqual(['Well 3']);
    expect(await r.samples.list({ search: '%' })).toHaveLength(0);
    expect((await r.samples.list({ search: '_A' })).map((s) => s.sampleName)).toEqual(['River_A']);
  });

  it('update of missing sample throws', async () => {
    await expect(r.samples.update('nope', { notes: 'x' })).rejects.toThrow(/not found/);
  });
});

describe('TestResultRepository (UNIT/NODE)', () => {
  it('inserts and maps every field', async () => {
    const out = await r.results.insert(makeResult({ deviceWarnings: ['cloudy_sample'], retestRequired: true }));
    expect(out.inserted).toBe(true);
    if (!out.inserted) return;
    const got = await r.results.getById(out.result.resultId);
    expect(got).toEqual(out.result);
    expect(got?.finalReportedConcentration).toBeCloseTo(0.21);
    expect(got?.dilutionFactor).toBe(1);
  });

  it('prevents duplicates by (deviceId, deviceTestId) (A16)', async () => {
    const a = await r.results.insert(makeResult());
    const b = await r.results.insert(makeResult({ concentration: 9 }));
    expect(a.inserted).toBe(true);
    expect(b).toEqual({ inserted: false, duplicateOf: a.inserted ? a.result.resultId : '' });
    expect(await r.results.count()).toBe(1);
  });

  it('same test id from a different device is not a duplicate', async () => {
    await r.devices.upsert({ deviceId: 'dev-2', deviceName: 'ESP32-A #2' });
    await r.results.insert(makeResult());
    expect((await r.results.insert(makeResult({ deviceId: 'dev-2' }))).inserted).toBe(true);
  });

  it('dilution keeps the original device concentration (A13)', async () => {
    const out = await r.results.insert(makeResult({ concentration: 0.4 }));
    if (!out.inserted) throw new Error('expected insert');
    const d = await r.results.setDilution(out.result.resultId, 5);
    expect(d.concentration).toBe(0.4);
    expect(d.finalReportedConcentration).toBeCloseTo(2.0);
    const stored = await r.results.getById(out.result.resultId);
    expect(stored?.concentration).toBe(0.4);
    expect(stored?.dilutionFactor).toBe(5);
    await expect(r.results.setDilution(out.result.resultId, 0.5)).rejects.toThrow(RangeError);
    await expect(r.results.setDilution(out.result.resultId, Number.NaN)).rejects.toThrow(RangeError);
  });

  it('final concentration is null when device concentration is null', async () => {
    expect(computeFinalConcentration(null, 3)).toBeNull();
    expect(computeFinalConcentration(Number.POSITIVE_INFINITY, 3)).toBeNull();
    const out = await r.results.insert(makeResult({ concentration: null, measurementQualityStatus: 'invalid' }));
    expect(out.inserted && out.result.finalReportedConcentration).toBeNull();
  });

  it('filters by parameter and searches sample name', async () => {
    const s = await r.samples.create({ sampleName: 'Tap kitchen', sourceType: 'tap', notes: null, photoPath: null, location: null });
    await r.results.insert(makeResult({ deviceTestId: 'a', parameter: 'cr6', sampleId: s.sampleId }));
    await r.results.insert(makeResult({ deviceTestId: 'b', parameter: 'nitrite' }));
    expect((await r.results.list({ parameters: ['cr6'] })).map((x) => x.deviceTestId)).toEqual(['a']);
    expect((await r.results.list({ search: 'kitchen' })).map((x) => x.deviceTestId)).toEqual(['a']);
    expect(await r.results.list({ parameters: ['lead'] })).toEqual([]);
  });

  it('deleting a sample unlinks results but keeps them', async () => {
    const s = await r.samples.create({ sampleName: 'S', sourceType: 'tap', notes: null, photoPath: null, location: null });
    const out = await r.results.insert(makeResult({ sampleId: s.sampleId }));
    await r.samples.delete(s.sampleId);
    expect((await r.results.getById(out.inserted ? out.result.resultId : ''))?.sampleId).toBeNull();
  });

  it('reports corrupt JSON columns instead of hiding them', async () => {
    const out = await r.results.insert(makeResult());
    await r.db.run("UPDATE test_results SET device_warnings='{bad' ");
    await expect(r.results.getById(out.inserted ? out.result.resultId : '')).rejects.toBeInstanceOf(CorruptColumnError);
  });
});

describe('CalibrationRepository (UNIT/NODE)', () => {
  const cal = { parameter: 'cr6' as const, slope: 0.8, intercept: 0.01, rSquared: 0.999, lod: null, loq: null, standardsUsed: [{ concentration: 0, absorbance: 0.01 }, { concentration: 1, absorbance: 0.81 }], status: 'active' as const };

  it('versions calibrations and supersedes the previous active one', async () => {
    const v1 = await r.calibrations.saveNewVersion(cal);
    const v2 = await r.calibrations.saveNewVersion({ ...cal, slope: 0.82 });
    expect([v1.calibrationVersion, v2.calibrationVersion]).toEqual([1, 2]);
    expect((await r.calibrations.getActive('cr6'))?.calibrationId).toBe(v2.calibrationId);
    expect((await r.calibrations.getById(v1.calibrationId))?.calibrationStatus).toBe('superseded');
    expect((await r.calibrations.getById(v1.calibrationId))?.slope).toBe(0.8);
  });

  it('draft does not replace active; activate switches', async () => {
    const a = await r.calibrations.saveNewVersion(cal);
    const d = await r.calibrations.saveNewVersion({ ...cal, status: 'draft' });
    expect((await r.calibrations.getActive('cr6'))?.calibrationId).toBe(a.calibrationId);
    await r.calibrations.activate(d.calibrationId);
    expect((await r.calibrations.getActive('cr6'))?.calibrationId).toBe(d.calibrationId);
  });

  it('rejects zero / non-finite slope', async () => {
    await expect(r.calibrations.saveNewVersion({ ...cal, slope: 0 })).rejects.toThrow();
    await expect(r.calibrations.saveNewVersion({ ...cal, slope: Number.NaN })).rejects.toThrow();
    expect(await r.calibrations.list('cr6')).toEqual([]);
  });

  it('parameters are versioned independently; markSent records time', async () => {
    await r.calibrations.saveNewVersion(cal);
    const n = await r.calibrations.saveNewVersion({ ...cal, parameter: 'nitrite' });
    expect(n.calibrationVersion).toBe(1);
    await r.calibrations.markSentToDevice(n.calibrationId, '2026-11-19T12:00:00.000Z');
    expect((await r.calibrations.getById(n.calibrationId))?.sentToDeviceAt).toBe('2026-11-19T12:00:00.000Z');
  });

  it('cannot delete a calibration referenced by a result (history preserved)', async () => {
    const c = await r.calibrations.saveNewVersion(cal);
    await r.results.insert(makeResult({ calibrationId: c.calibrationId }));
    await expect(r.db.run('DELETE FROM calibrations WHERE calibration_id=?', [c.calibrationId])).rejects.toThrow(/FOREIGN KEY/);
  });
});

describe('ReagentRepository (UNIT/NODE)', () => {
  const base = { parameter: 'cr6' as const, reagentName: 'DPC', quantityRemaining: 10, quantityUnit: 'mL', quantityPerTest: 0.5, lowStockThreshold: 5, expiryDate: '2027-06-30', batchNumber: 'B-12' };

  it('estimates tests remaining incl. float edge cases', () => {
    expect(estimateTestsRemaining(10, 0.5)).toBe(20);
    expect(estimateTestsRemaining(0.3, 0.1)).toBe(3);
    expect(estimateTestsRemaining(1, 0)).toBe(0);
    expect(estimateTestsRemaining(Number.NaN, 1)).toBe(0);
    expect(estimateTestsRemaining(-1, 1)).toBe(0);
  });

  it('consumes stock per test and recomputes tests remaining', async () => {
    const g = await r.reagents.create(base);
    expect(g.testsRemaining).toBe(20);
    const after = await r.reagents.consumeForTest(g.reagentId, new Date(2026, 10, 19));
    expect(after.quantityRemaining).toBeCloseTo(9.5);
    expect(after.testsRemaining).toBe(19);
  });

  it('blocks expired reagents (A12), expiry day inclusive', async () => {
    const g = await r.reagents.create({ ...base, expiryDate: '2026-11-19' });
    expect(isExpired(g, new Date(2026, 10, 19, 23, 0))).toBe(false);
    expect(isExpired(g, new Date(2026, 10, 20, 0, 1))).toBe(true);
    await expect(r.reagents.consumeForTest(g.reagentId, new Date(2026, 10, 21))).rejects.toBeInstanceOf(ExpiredReagentError);
    expect(await r.reagents.listUsable('cr6', new Date(2026, 10, 21))).toEqual([]);
    expect(daysUntilExpiry(g, new Date(2026, 10, 9))).toBe(10);
  });

  it('blocks empty reagents and flags low stock', async () => {
    const g = await r.reagents.create({ ...base, quantityRemaining: 0.4 });
    expect(g.testsRemaining).toBe(0);
    expect(isLowStock(g)).toBe(true);
    await expect(r.reagents.consumeForTest(g.reagentId, new Date(2026, 0, 1))).rejects.toBeInstanceOf(InsufficientReagentError);
  });

  it('adjusts stock and rejects going negative', async () => {
    const g = await r.reagents.create(base);
    expect((await r.reagents.adjustStock(g.reagentId, 5)).testsRemaining).toBe(30);
    await expect(r.reagents.adjustStock(g.reagentId, -100)).rejects.toThrow(RangeError);
    await expect(r.reagents.adjustStock(g.reagentId, Number.POSITIVE_INFINITY)).rejects.toThrow(RangeError);
  });
});

describe('DeviceRepository (UNIT/NODE)', () => {
  it('upsert keeps firmware when not provided and tracks sync metadata', async () => {
    await r.devices.upsert({ deviceId: 'dev-1', deviceName: 'ESP32-A', firmwareVersion: '1.2.0' });
    await r.devices.upsert({ deviceId: 'dev-1', deviceName: 'Renamed' });
    const d = await r.devices.getById('dev-1');
    expect(d).toMatchObject({ deviceName: 'Renamed', firmwareVersion: '1.2.0' });
    expect(await r.devices.getSyncMetadata('dev-1')).toEqual({ deviceId: 'dev-1', lastSyncTimestamp: null, lastSyncedDeviceResultId: null, pendingSyncRecords: 0 });
    await r.devices.updateSyncMetadata({ deviceId: 'dev-1', lastSyncTimestamp: '2026-11-19T10:00:00.000Z', lastSyncedDeviceResultId: 'T-9', pendingSyncRecords: 0 });
    expect((await r.devices.getById('dev-1'))?.lastSync).toBe('2026-11-19T10:00:00.000Z');
    expect((await r.devices.getSyncMetadata('dev-1')).lastSyncedDeviceResultId).toBe('T-9');
  });
});

describe('SettingsRepository (UNIT/NODE)', () => {
  it('returns defaults, persists values, validates input', async () => {
    expect(await r.settings.getAll()).toEqual(DEFAULT_SETTINGS);
    await r.settings.set('theme', 'dark');
    expect(await r.settings.get('theme')).toBe('dark');
    await expect(r.settings.set('theme', 'neon' as never)).rejects.toThrow();
  });

  it('reports corrupt stored values', async () => {
    await r.db.run("INSERT INTO settings (key, value) VALUES ('theme', '\"neon\"')");
    await expect(r.settings.get('theme')).rejects.toBeInstanceOf(CorruptColumnError);
  });
});

describe('TimerRepository (UNIT/NODE)', () => {
  it('persists running timers for restart recovery', async () => {
    const t = { timerId: 't1', parameter: 'cr6' as const, sampleId: null, startedAt: '2026-11-19T10:00:00.000Z', durationS: 300, notificationId: 'n1' };
    await r.timers.save(t);
    expect(await r.timers.list()).toEqual([t]);
    await r.timers.remove('t1');
    expect(await r.timers.list()).toEqual([]);
  });
});
