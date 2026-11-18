import type { AppSettings } from '@/database/repositories/SettingsRepository';

export type ConcentrationUnit = AppSettings['units'];

/** Converts mg/L (device/storage unit) to the display unit. Display only; stored values stay mg/L. */
export function convertConcentration(mgPerL: number, unit: ConcentrationUnit): number {
  return unit === 'µg/L' ? mgPerL * 1000 : mgPerL;
}

/** Significant-figure aware formatting; returns '—' for null / non-finite (never a fabricated number). */
export function formatConcentration(mgPerL: number | null | undefined, unit: ConcentrationUnit, withUnit = true): string {
  if (mgPerL === null || mgPerL === undefined || !Number.isFinite(mgPerL)) return '—';
  const v = convertConcentration(mgPerL, unit);
  const abs = Math.abs(v);
  const digits = abs === 0 ? 2 : abs < 0.1 ? 4 : abs < 1 ? 3 : abs < 100 ? 2 : 0;
  const s = v.toFixed(digits);
  return withUnit ? `${s} ${unit}` : s;
}

export function formatNumber(v: number | null | undefined, digits = 4): string {
  if (v === null || v === undefined || !Number.isFinite(v)) return '—';
  return v.toFixed(digits);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function formatDate(iso: string | null | undefined): string {
  return formatDateTime(iso).slice(0, 10);
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return 'never';
  const diff = Math.round((now - Date.parse(iso)) / 1000);
  if (!Number.isFinite(diff)) return '—';
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} h ago`;
  return `${Math.floor(diff / 86400)} d ago`;
}
