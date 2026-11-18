import { NewSampleSchema, SampleSchema, type NewSample, type Sample } from '@/types/domain';
import { createId, nowIso } from '@/utils/id';

import type { Database } from '../types';

interface SampleRow {
  sample_id: string;
  sample_name: string;
  source_type: string;
  notes: string | null;
  photo_path: string | null;
  latitude: number | null;
  longitude: number | null;
  location_accuracy: number | null;
  location_timestamp: string | null;
  created_at: string;
}

function fromRow(r: SampleRow): Sample {
  return SampleSchema.parse({
    sampleId: r.sample_id,
    sampleName: r.sample_name,
    sourceType: r.source_type,
    notes: r.notes,
    photoPath: r.photo_path,
    location:
      r.latitude !== null && r.longitude !== null && r.location_timestamp !== null
        ? { latitude: r.latitude, longitude: r.longitude, accuracy: r.location_accuracy, timestamp: r.location_timestamp }
        : null,
    createdAt: r.created_at,
  });
}

function toParams(s: Sample) {
  return [
    s.sampleId,
    s.sampleName.trim(),
    s.sourceType,
    s.notes,
    s.photoPath,
    s.location?.latitude ?? null,
    s.location?.longitude ?? null,
    s.location?.accuracy ?? null,
    s.location?.timestamp ?? null,
    s.createdAt,
  ] as const;
}

const COLS =
  'sample_id, sample_name, source_type, notes, photo_path, latitude, longitude, location_accuracy, location_timestamp, created_at';

export class SampleRepository {
  constructor(private readonly db: Database) {}

  async create(input: NewSample): Promise<Sample> {
    const data = NewSampleSchema.parse(input);
    const sample: Sample = { ...data, sampleId: createId(), createdAt: nowIso() };
    await this.db.run(`INSERT INTO samples (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?)`, toParams(sample));
    return sample;
  }

  /** Inserts an existing record verbatim (used by restore). */
  async insertRaw(sample: Sample): Promise<void> {
    const s = SampleSchema.parse(sample);
    await this.db.run(`INSERT INTO samples (${COLS}) VALUES (?,?,?,?,?,?,?,?,?,?)`, toParams(s));
  }

  async getById(id: string): Promise<Sample | null> {
    const r = await this.db.get<SampleRow>(`SELECT ${COLS} FROM samples WHERE sample_id = ?`, [id]);
    return r ? fromRow(r) : null;
  }

  async update(id: string, patch: Partial<NewSample>): Promise<Sample> {
    const existing = await this.getById(id);
    if (!existing) throw new Error(`Sample ${id} not found`);
    const next = SampleSchema.parse({ ...existing, ...patch });
    await this.db.run(
      `UPDATE samples SET sample_name=?, source_type=?, notes=?, photo_path=?, latitude=?, longitude=?, location_accuracy=?, location_timestamp=? WHERE sample_id=?`,
      [...toParams(next).slice(1, 9), id],
    );
    return next;
  }

  async delete(id: string): Promise<boolean> {
    const r = await this.db.run('DELETE FROM samples WHERE sample_id = ?', [id]);
    return r.changes > 0;
  }

  async list(opts: { search?: string; limit?: number; offset?: number } = {}): Promise<Sample[]> {
    const where: string[] = [];
    const params: (string | number)[] = [];
    if (opts.search?.trim()) {
      where.push('(sample_name LIKE ? ESCAPE \'\\\' OR notes LIKE ? ESCAPE \'\\\')');
      const q = `%${escapeLike(opts.search.trim())}%`;
      params.push(q, q);
    }
    const sql = `SELECT ${COLS} FROM samples ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY created_at DESC LIMIT ? OFFSET ?`;
    const rows = await this.db.all<SampleRow>(sql, [...params, opts.limit ?? 500, opts.offset ?? 0]);
    return rows.map(fromRow);
  }

  async listPhotoPaths(): Promise<string[]> {
    const rows = await this.db.all<{ photo_path: string }>('SELECT photo_path FROM samples WHERE photo_path IS NOT NULL');
    return rows.map((r) => r.photo_path);
  }
}

export function escapeLike(s: string): string {
  return s.replace(/[\\%_]/g, (m) => `\\${m}`);
}
