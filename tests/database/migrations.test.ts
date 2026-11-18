import { currentSchemaVersion, migrate } from '@/database/migrate';
import type { Database } from '@/database/types';

import { openNodeDatabase } from '../helpers/nodeSqliteDriver';

describe('CP02 schema migrations (UNIT/NODE)', () => {
  let db: Database;
  beforeEach(() => {
    db = openNodeDatabase();
  });
  afterEach(() => db.close());

  it('creates all tables and records version 1', async () => {
    expect(await migrate(db)).toEqual([1]);
    const tables = (await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name")).map(
      (t) => t.name,
    );
    expect(tables).toEqual(
      expect.arrayContaining([
        'active_timers',
        'calibrations',
        'devices',
        'reagents',
        'samples',
        'schema_migrations',
        'settings',
        'sync_metadata',
        'test_results',
      ]),
    );
    expect(await currentSchemaVersion(db)).toBe(1);
  });

  it('is idempotent', async () => {
    await migrate(db);
    expect(await migrate(db)).toEqual([]);
  });

  it('rolls back a failing migration and leaves version unchanged', async () => {
    await migrate(db);
    await expect(migrate(db, [{ version: 2, name: 'bad', sql: 'CREATE TABLE x (a); NOT VALID SQL;' }])).rejects.toThrow();
    expect(await currentSchemaVersion(db)).toBe(1);
    expect(await db.get("SELECT name FROM sqlite_master WHERE name='x'")).toBeNull();
  });

  describe('constraints', () => {
    beforeEach(() => migrate(db));
    const now = '2026-11-19T00:00:00.000Z';
    const addDevice = () => db.run("INSERT INTO devices (device_id, device_name) VALUES ('d1','ESP32-A')");
    const addResult = (id: string, testId: string, device = 'd1') =>
      db.run(
        `INSERT INTO test_results (result_id, device_test_id, device_id, parameter, measurement_quality_status, phone_timestamp, created_at)
         VALUES (?, ?, ?, 'nitrite', 'ok', ?, ?)`,
        [id, testId, device, now, now],
      );

    it('enforces foreign keys', async () => {
      await expect(addResult('r1', 't1', 'missing-device')).rejects.toThrow(/FOREIGN KEY/);
    });

    it('rejects duplicate (device_id, device_test_id)', async () => {
      await addDevice();
      await addResult('r1', 't1');
      await expect(addResult('r2', 't1')).rejects.toThrow(/UNIQUE/);
    });

    it('rejects zero slope calibration', async () => {
      await expect(
        db.run(
          `INSERT INTO calibrations (calibration_id, parameter, slope, intercept, calibration_date, calibration_version, standards_used, calibration_status)
           VALUES ('c1','nitrite',0,0,?,1,'[]','active')`,
          [now],
        ),
      ).rejects.toThrow(/CHECK/);
    });

    it('rejects dilution factor below 1 and out-of-range latitude', async () => {
      await addDevice();
      await expect(
        db.run(
          `INSERT INTO test_results (result_id, device_test_id, device_id, parameter, measurement_quality_status, dilution_factor, phone_timestamp, created_at)
           VALUES ('r1','t1','d1','nitrite','ok',0.5,?,?)`,
          [now, now],
        ),
      ).rejects.toThrow(/CHECK/);
      await expect(
        db.run("INSERT INTO samples (sample_id, sample_name, source_type, latitude, created_at) VALUES ('s','n','tap',91,?)", [now]),
      ).rejects.toThrow(/CHECK/);
    });

    it('restricts deleting a device that has results', async () => {
      await addDevice();
      await addResult('r1', 't1');
      await expect(db.run("DELETE FROM devices WHERE device_id='d1'")).rejects.toThrow(/FOREIGN KEY/);
    });

    it('transaction rolls back all statements on error', async () => {
      await expect(
        db.transaction(async () => {
          await addDevice();
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      expect(await db.get('SELECT * FROM devices')).toBeNull();
    });

    it('serialises concurrent transactions', async () => {
      await Promise.all(
        [1, 2, 3].map((i) =>
          db.transaction(async () => {
            await db.run('INSERT INTO settings (key, value) VALUES (?, ?)', [`k${i}`, '1']);
            await Promise.resolve();
            await db.run('UPDATE settings SET value = ? WHERE key = ?', ['2', `k${i}`]);
          }),
        ),
      );
      expect(await db.all('SELECT * FROM settings')).toHaveLength(3);
    });
  });
});
