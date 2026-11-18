import { z } from 'zod';

import { BLE_PROTOCOL } from '@/config/ble';
import { ParameterSchema, type NewTestResult } from '@/types/domain';

import { parseCameraValidation } from '../measurement/cameraValidation';
import { deriveQualityStatus } from '../measurement/quality';

/** Device → phone message schemas. PROVISIONAL contract — see docs/BLE_PROTOCOL.md. */
const num = z.number().finite();
const nullableNum = num.nullable().optional().transform((v) => v ?? null);

export const SelfTestSchema = z.record(z.enum(['pass', 'fail', 'unknown']));

export const DeviceResultSchema = z.object({
  device_test_id: z.string().min(1).max(64),
  parameter: ParameterSchema,
  idark: nullableNum,
  iblank: nullableNum,
  isample: nullableNum,
  absorbance: nullableNum,
  concentration: nullableNum,
  camera: z.unknown().optional(),
  retest: z.boolean().default(false),
  warnings: z.array(z.string().max(64)).max(32).default([]),
  calibration: z
    .object({ version: z.number().int().nullable().optional(), slope: num.optional(), intercept: num.optional() })
    .passthrough()
    .nullable()
    .optional(),
  firmware: z.string().max(32).nullable().optional(),
  timestamp: z
    .string()
    .refine((s) => !Number.isNaN(Date.parse(s)), 'invalid timestamp')
    .nullable()
    .optional(),
});
export type DeviceResult = z.infer<typeof DeviceResultSchema>;

const Base = { v: z.literal(BLE_PROTOCOL.protocolVersion) };

export const DeviceMessageSchema = z.discriminatedUnion('type', [
  z.object({ ...Base, type: z.literal('ack'), id: z.number().int(), ok: z.literal(true), data: z.unknown().optional() }),
  z.object({ ...Base, type: z.literal('error'), id: z.number().int().nullable(), code: z.string(), message: z.string().optional() }),
  z.object({
    ...Base,
    type: z.literal('status'),
    id: z.number().int().nullable().optional(),
    device_id: z.string().min(1).max(64),
    name: z.string().max(64),
    firmware: z.string().max(32),
    busy: z.boolean().default(false),
    battery: num.nullable().optional(),
    self_test: SelfTestSchema.default({}),
    stored_results: z.number().int().nonnegative().optional(),
    calibrations: z
      .record(z.object({ version: z.number().int().nullable(), slope: num.nullable(), intercept: num.nullable() }))
      .default({}),
  }),
  z.object({ ...Base, type: z.literal('progress'), stage: z.string().max(32), device_test_id: z.string().optional() }),
  z.object({ ...Base, type: z.literal('result'), id: z.number().int().nullable().optional(), result: DeviceResultSchema }),
  z.object({
    ...Base,
    type: z.literal('results_batch'),
    id: z.number().int(),
    results: z.array(z.unknown()),
    more: z.boolean(),
  }),
]);
export type DeviceMessage = z.infer<typeof DeviceMessageSchema>;

export type ParseOutcome =
  | { ok: true; message: DeviceMessage }
  | { ok: false; error: 'invalid_json' | 'unsupported_version' | 'invalid_message'; detail: string };

export function parseDeviceFrame(text: string): ParseOutcome {
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { ok: false, error: 'invalid_json', detail: e instanceof Error ? e.message : String(e) };
  }
  if (typeof json === 'object' && json !== null && 'v' in json && (json as { v: unknown }).v !== BLE_PROTOCOL.protocolVersion) {
    return { ok: false, error: 'unsupported_version', detail: `v=${String((json as { v: unknown }).v)}` };
  }
  const r = DeviceMessageSchema.safeParse(json);
  if (!r.success) return { ok: false, error: 'invalid_message', detail: r.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  return { ok: true, message: r.data };
}

/** Validates one stored/live result object and maps it to a persistable record. Never fabricates values. */
export function toNewTestResult(
  raw: unknown,
  ctx: { deviceId: string; calibrationId: string | null; phoneTimestamp: string; sampleId?: string | null },
): { ok: true; value: NewTestResult } | { ok: false; detail: string } {
  const p = DeviceResultSchema.safeParse(raw);
  if (!p.success) return { ok: false, detail: p.error.issues.slice(0, 3).map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') };
  const d = p.data;
  const camera = parseCameraValidation(d.camera ?? null);
  const retestRequired = d.retest || camera.retestSuggested;
  return {
    ok: true,
    value: {
      deviceTestId: d.device_test_id,
      deviceId: ctx.deviceId,
      sampleId: ctx.sampleId ?? null,
      parameter: d.parameter,
      rawIdark: d.idark,
      rawIblank: d.iblank,
      rawIsample: d.isample,
      absorbance: d.absorbance,
      concentration: d.concentration,
      cameraRgb: camera.rgb,
      cameraValidationStatus: camera.rawStatus === null ? null : camera.status === 'unknown' ? camera.rawStatus : camera.status,
      retestRequired,
      measurementQualityStatus: deriveQualityStatus({ concentrationValid: d.concentration !== null, retestRequired, warnings: d.warnings }),
      deviceWarnings: d.warnings,
      calibrationId: ctx.calibrationId,
      deviceCalibrationMeta: d.calibration ? { ...d.calibration } : null,
      firmwareVersion: d.firmware ?? null,
      deviceTimestamp: d.timestamp ? new Date(d.timestamp).toISOString() : null,
      phoneTimestamp: ctx.phoneTimestamp,
    },
  };
}
