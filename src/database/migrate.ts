import { MIGRATIONS, type Migration } from './migrations';
import type { Database } from './types';

/** Applies pending migrations in order, each in its own transaction. Idempotent. */
export async function migrate(db: Database, migrations: readonly Migration[] = MIGRATIONS): Promise<number[]> {
  await db.exec(
    'CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY NOT NULL, name TEXT NOT NULL, applied_at TEXT NOT NULL)',
  );
  const rows = await db.all<{ version: number }>('SELECT version FROM schema_migrations');
  const applied = new Set(rows.map((r) => r.version));
  const sorted = [...migrations].sort((a, b) => a.version - b.version);
  const ran: number[] = [];
  for (const m of sorted) {
    if (applied.has(m.version)) continue;
    await db.transaction(async () => {
      await db.exec(m.sql);
      await db.run('INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)', [
        m.version,
        m.name,
        new Date().toISOString(),
      ]);
    });
    ran.push(m.version);
  }
  return ran;
}

export async function currentSchemaVersion(db: Database): Promise<number> {
  const row = await db.get<{ v: number | null }>('SELECT MAX(version) AS v FROM schema_migrations');
  return row?.v ?? 0;
}
