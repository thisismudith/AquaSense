import { z } from 'zod';

import { RgbSchema, type Rgb } from '@/types/domain';

/**
 * Camera cross-check is performed by ESP32-A firmware (RGB from ESP32-B via UART).
 * The algorithm and tolerance are NOT specified (DECISIONS U2), so the app only parses and displays
 * what firmware reports. Status vocabulary below is PROVISIONAL until the firmware protocol is supplied.
 */
export const CAMERA_STATUSES = ['agree', 'disagree', 'unavailable', 'not_checked'] as const;
export type CameraStatus = (typeof CAMERA_STATUSES)[number] | 'unknown';

export interface CameraValidation {
  status: CameraStatus;
  /** Original status string from the device, preserved for display and audit. */
  rawStatus: string | null;
  rgb: Rgb | null;
  retestSuggested: boolean;
}

const InputSchema = z
  .object({
    status: z.string().nullish(),
    rgb: z.unknown().optional(),
  })
  .passthrough();

export function parseCameraValidation(input: unknown): CameraValidation {
  const parsed = InputSchema.safeParse(input);
  if (!parsed.success) return { status: 'unknown', rawStatus: null, rgb: null, retestSuggested: false };
  const raw = parsed.data.status ?? null;
  const norm = raw?.trim().toLowerCase().replace(/[\s-]+/g, '_') ?? null;
  const status: CameraStatus =
    norm === null ? 'not_checked' : (CAMERA_STATUSES as readonly string[]).includes(norm) ? (norm as CameraStatus) : 'unknown';
  const rgbParse = RgbSchema.safeParse(parsed.data.rgb);
  const rgb = rgbParse.success && [rgbParse.data.r, rgbParse.data.g, rgbParse.data.b].every((v) => v >= 0 && v <= 65535) ? rgbParse.data : null;
  return { status, rawStatus: raw, rgb, retestSuggested: status === 'disagree' };
}
