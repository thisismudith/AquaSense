import * as SQLite from 'expo-sqlite';

import { createTransactionRunner, type Database, type SqlParams } from './types';

export async function openExpoDatabase(name = 'sipsure.db'): Promise<Database> {
  const native = await SQLite.openDatabaseAsync(name);
  const base = {
    exec: (sql: string) => native.execAsync(sql),
  };
  const db: Database = {
    exec: base.exec,
    async run(sql, params: SqlParams = []) {
      const r = await native.runAsync(sql, [...params]);
      return { changes: r.changes, lastInsertRowId: r.lastInsertRowId };
    },
    get: <T>(sql: string, params: SqlParams = []) => native.getFirstAsync<T>(sql, [...params]),
    all: <T>(sql: string, params: SqlParams = []) => native.getAllAsync<T>(sql, [...params]),
    transaction: createTransactionRunner(base),
    close: () => native.closeAsync(),
  };
  await db.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  return db;
}
