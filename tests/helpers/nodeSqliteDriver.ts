/// <reference types="node" />
/** Test-only driver: same Database contract backed by Node's built-in node:sqlite. */
import { DatabaseSync } from 'node:sqlite';

import { createTransactionRunner, type Database, type SqlParams } from '@/database/types';

export function openNodeDatabase(path = ':memory:'): Database {
  const native = new DatabaseSync(path);
  native.exec('PRAGMA foreign_keys = ON;');
  const exec = async (sql: string) => {
    native.exec(sql);
  };
  return {
    exec,
    async run(sql, params: SqlParams = []) {
      const r = native.prepare(sql).run(...params);
      return { changes: Number(r.changes), lastInsertRowId: Number(r.lastInsertRowid) };
    },
    async get<T>(sql: string, params: SqlParams = []) {
      const row = native.prepare(sql).get(...params);
      return (row ?? null) as T | null;
    },
    async all<T>(sql: string, params: SqlParams = []) {
      return native.prepare(sql).all(...params) as T[];
    },
    transaction: createTransactionRunner({ exec }),
    async close() {
      native.close();
    },
  };
}
