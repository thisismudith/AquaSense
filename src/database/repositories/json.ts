/** JSON column helpers. Corrupt JSON is reported, never silently replaced with a default. */
export class CorruptColumnError extends Error {
  constructor(column: string, cause: unknown) {
    super(`Corrupt JSON in column ${column}: ${cause instanceof Error ? cause.message : String(cause)}`);
    this.name = 'CorruptColumnError';
  }
}

export function parseJsonColumn<T>(column: string, raw: string | null): T | null {
  if (raw === null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch (e) {
    throw new CorruptColumnError(column, e);
  }
}

export const toJson = (v: unknown): string | null => (v === null || v === undefined ? null : JSON.stringify(v));
