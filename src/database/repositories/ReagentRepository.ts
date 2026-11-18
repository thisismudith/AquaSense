import type { ParameterId } from '@/config/parameters';
import { NewReagentSchema, ReagentSchema, type NewReagent, type Reagent } from '@/types/domain';
import { createId, nowIso } from '@/utils/id';

import type { Database, SqlValue } from '../types';

interface ReagentRow {
  reagent_id: string;
  parameter: string;
  reagent_name: string;
  quantity_remaining: number;
  quantity_unit: string;
  quantity_per_test: number;
  tests_remaining: number;
  low_stock_threshold: number;
  expiry_date: string;
  batch_number: string | null;
  created_at: string;
}

const COLS =
  'reagent_id, parameter, reagent_name, quantity_remaining, quantity_unit, quantity_per_test, tests_remaining, low_stock_threshold, expiry_date, batch_number, created_at';

function fromRow(r: ReagentRow): Reagent {
  return ReagentSchema.parse({
    reagentId: r.reagent_id,
    parameter: r.parameter,
    reagentName: r.reagent_name,
    quantityRemaining: r.quantity_remaining,
    quantityUnit: r.quantity_unit,
    quantityPerTest: r.quantity_per_test,
    testsRemaining: r.tests_remaining,
    lowStockThreshold: r.low_stock_threshold,
    expiryDate: r.expiry_date,
    batchNumber: r.batch_number,
    createdAt: r.created_at,
  });
}

function toParams(r: Reagent): SqlValue[] {
  return [
    r.reagentId,
    r.parameter,
    r.reagentName.trim(),
    r.quantityRemaining,
    r.quantityUnit,
    r.quantityPerTest,
    r.testsRemaining,
    r.lowStockThreshold,
    r.expiryDate,
    r.batchNumber,
    r.createdAt,
  ];
}

/** Estimated tests remaining = floor(quantity / quantity per test). Tolerates float error. */
export function estimateTestsRemaining(quantity: number, perTest: number): number {
  if (!(perTest > 0) || !(quantity >= 0) || !Number.isFinite(quantity)) return 0;
  return Math.floor(quantity / perTest + 1e-9);
}

/** Reads the calendar date (YYYY-MM-DD prefix) without timezone shifting. */
function calendarDate(iso: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!match) throw new RangeError(`Invalid expiry date: ${iso}`);
  return { y: Number(match[1]), m: Number(match[2]) - 1, d: Number(match[3]) };
}

export function isExpired(r: Pick<Reagent, 'expiryDate'>, now = new Date()): boolean {
  // Expiry date is inclusive: a reagent expiring "2026-11-19" is usable through that local day.
  const { y, m, d } = calendarDate(r.expiryDate);
  return now.getTime() > new Date(y, m, d, 23, 59, 59, 999).getTime();
}

export function daysUntilExpiry(r: Pick<Reagent, 'expiryDate'>, now = new Date()): number {
  const { y, m, d } = calendarDate(r.expiryDate);
  const a = Date.UTC(y, m, d);
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((a - b) / 86_400_000);
}

export function isLowStock(r: Pick<Reagent, 'testsRemaining' | 'lowStockThreshold'>): boolean {
  return r.testsRemaining <= r.lowStockThreshold;
}

export class ExpiredReagentError extends Error {
  constructor(public readonly reagentId: string) {
    super('Reagent is expired and cannot be used');
    this.name = 'ExpiredReagentError';
  }
}
export class InsufficientReagentError extends Error {
  constructor(public readonly reagentId: string) {
    super('Not enough reagent remaining for a test');
    this.name = 'InsufficientReagentError';
  }
}

export class ReagentRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewReagent): Promise<Reagent> {
    const d = NewReagentSchema.parse(input);
    const r: Reagent = {
      ...d,
      reagentId: createId(),
      createdAt: nowIso(),
      testsRemaining: estimateTestsRemaining(d.quantityRemaining, d.quantityPerTest),
    };
    await this.db.run(`INSERT INTO reagents (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, toParams(r));
    return r;
  }

  async insertRaw(r: Reagent): Promise<void> {
    await this.db.run(`INSERT INTO reagents (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?,?)`, toParams(ReagentSchema.parse(r)));
  }

  async getById(id: string): Promise<Reagent | null> {
    const r = await this.db.get<ReagentRow>(`SELECT ${COLS} FROM reagents WHERE reagent_id=?`, [id]);
    return r ? fromRow(r) : null;
  }

  async update(id: string, patch: Partial<NewReagent>): Promise<Reagent> {
    const ex = await this.getById(id);
    if (!ex) throw new Error(`Reagent ${id} not found`);
    const merged = { ...ex, ...patch };
    const next = ReagentSchema.parse({
      ...merged,
      testsRemaining: estimateTestsRemaining(merged.quantityRemaining, merged.quantityPerTest),
    });
    await this.db.run(
      `UPDATE reagents SET parameter=?, reagent_name=?, quantity_remaining=?, quantity_unit=?, quantity_per_test=?, tests_remaining=?,
       low_stock_threshold=?, expiry_date=?, batch_number=? WHERE reagent_id=?`,
      [...toParams(next).slice(1, 10), id],
    );
    return next;
  }

  /** Adjusts stock by a signed amount (restock > 0, correction < 0). Never goes below 0. */
  async adjustStock(id: string, delta: number): Promise<Reagent> {
    if (!Number.isFinite(delta)) throw new RangeError('Stock change must be a finite number');
    const ex = await this.getById(id);
    if (!ex) throw new Error(`Reagent ${id} not found`);
    const q = ex.quantityRemaining + delta;
    if (q < -1e-9) throw new RangeError('Stock cannot go below zero');
    return this.update(id, { quantityRemaining: Math.max(0, q) });
  }

  /** Consumes one test's worth of reagent. Blocks expired or empty reagents (A12). */
  async consumeForTest(id: string, now = new Date()): Promise<Reagent> {
    const ex = await this.getById(id);
    if (!ex) throw new Error(`Reagent ${id} not found`);
    if (isExpired(ex, now)) throw new ExpiredReagentError(id);
    if (ex.testsRemaining < 1) throw new InsufficientReagentError(id);
    return this.adjustStock(id, -ex.quantityPerTest);
  }

  async delete(id: string): Promise<boolean> {
    return (await this.db.run('DELETE FROM reagents WHERE reagent_id=?', [id])).changes > 0;
  }

  async list(parameter?: ParameterId): Promise<Reagent[]> {
    const rows = parameter
      ? await this.db.all<ReagentRow>(`SELECT ${COLS} FROM reagents WHERE parameter=? ORDER BY expiry_date`, [parameter])
      : await this.db.all<ReagentRow>(`SELECT ${COLS} FROM reagents ORDER BY parameter, expiry_date`);
    return rows.map(fromRow);
  }

  /** Usable reagents for a parameter: not expired and ≥ 1 test remaining, soonest expiry first. */
  async listUsable(parameter: ParameterId, now = new Date()): Promise<Reagent[]> {
    return (await this.list(parameter)).filter((r) => !isExpired(r, now) && r.testsRemaining >= 1);
  }
}
