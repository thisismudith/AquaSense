/** Driver-agnostic database contract. The app uses Expo SQLite; tests use node:sqlite. */
export type SqlValue = string | number | null;
export type SqlParams = readonly SqlValue[];

export interface RunResult {
  changes: number;
  lastInsertRowId: number;
}

export interface Database {
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParams): Promise<RunResult>;
  get<T>(sql: string, params?: SqlParams): Promise<T | null>;
  all<T>(sql: string, params?: SqlParams): Promise<T[]>;
  /** Runs `fn` inside BEGIN/COMMIT; rolls back and rethrows on error. Calls are serialised. */
  transaction<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

/**
 * Serialises transactions so concurrent async callers cannot interleave statements.
 * Do not call `transaction` from inside another transaction's callback (it would wait on itself).
 */
export function createTransactionRunner(db: Pick<Database, 'exec'>) {
  let queue: Promise<unknown> = Promise.resolve();
  return function transaction<T>(fn: () => Promise<T>): Promise<T> {
    const run = async () => {
      await db.exec('BEGIN');
      try {
        const r = await fn();
        await db.exec('COMMIT');
        return r;
      } catch (e) {
        await db.exec('ROLLBACK');
        throw e;
      }
    };
    const p = queue.then(run, run);
    queue = p.catch(() => undefined);
    return p;
  };
}
