import { z } from 'zod';

import { PARAMETER_IDS, SOURCE_TYPES } from '@/config/parameters';

export const ParameterSchema = z.enum(PARAMETER_IDS);
export const SourceTypeSchema = z.enum(SOURCE_TYPES);

const isoDate = z.string().refine((s) => !Number.isNaN(Date.parse(s)), 'invalid ISO date');
const finite = z.number().finite();

/** Device warning vocabulary from feature list §3. Unknown codes are preserved as strings. */
export const KNOWN_DEVICE_WARNINGS = [
  'retest_needed',
  'unstable_reading',
  'over_range',
  'below_detection',
  'cloudy_sample',
  'stray_light',
  'dark_drift_high',
  'supply_voltage',
  'camera_link_lost',
  'no_calibration',
] as const;
export type KnownDeviceWarning = (typeof KNOWN_DEVICE_WARNINGS)[number];

export const MEASUREMENT_QUALITY = [
  'ok',
  'retest_required',
  'unstable',
  'over_range',
  'below_detection',
  'invalid',
] as const;
export const MeasurementQualitySchema = z.enum(MEASUREMENT_QUALITY);
export type MeasurementQuality = z.infer<typeof MeasurementQualitySchema>;

export const LocationSchema = z.object({
  latitude: finite.min(-90).max(90),
  longitude: finite.min(-180).max(180),
  accuracy: finite.nonnegative().nullable(),
  timestamp: isoDate,
});
export type GeoLocation = z.infer<typeof LocationSchema>;

export const SampleSchema = z.object({
  sampleId: z.string().min(1),
  sampleName: z.string().trim().min(1).max(120),
  sourceType: SourceTypeSchema,
  notes: z.string().max(2000).nullable(),
  photoPath: z.string().nullable(),
  location: LocationSchema.nullable(),
  createdAt: isoDate,
});
export type Sample = z.infer<typeof SampleSchema>;
export const NewSampleSchema = SampleSchema.omit({ sampleId: true, createdAt: true });
export type NewSample = z.infer<typeof NewSampleSchema>;

export const RgbSchema = z.object({ r: finite, g: finite, b: finite });
export type Rgb = z.infer<typeof RgbSchema>;

export const TestResultSchema = z.object({
  resultId: z.string().min(1),
  deviceTestId: z.string().min(1),
  deviceId: z.string().min(1),
  sampleId: z.string().nullable(),
  parameter: ParameterSchema,
  rawIdark: finite.nullable(),
  rawIblank: finite.nullable(),
  rawIsample: finite.nullable(),
  absorbance: finite.nullable(),
  concentration: finite.nullable(),
  cameraRgb: RgbSchema.nullable(),
  cameraValidationStatus: z.string().nullable(),
  retestRequired: z.boolean(),
  measurementQualityStatus: MeasurementQualitySchema,
  deviceWarnings: z.array(z.string()),
  dilutionFactor: finite.min(1),
  finalReportedConcentration: finite.nullable(),
  calibrationId: z.string().nullable(),
  deviceCalibrationMeta: z.record(z.unknown()).nullable(),
  firmwareVersion: z.string().nullable(),
  deviceTimestamp: isoDate.nullable(),
  phoneTimestamp: isoDate,
  createdAt: isoDate,
});
export type TestResult = z.infer<typeof TestResultSchema>;
export type NewTestResult = Omit<TestResult, 'resultId' | 'createdAt' | 'finalReportedConcentration' | 'dilutionFactor'> & {
  dilutionFactor?: number;
};

export const StandardPointSchema = z.object({ concentration: finite.nonnegative(), absorbance: finite });
export type StandardPoint = z.infer<typeof StandardPointSchema>;

export const CALIBRATION_STATUS = ['active', 'superseded', 'draft'] as const;
export const CalibrationSchema = z.object({
  calibrationId: z.string().min(1),
  parameter: ParameterSchema,
  slope: finite.refine((v) => v !== 0, 'slope must be non-zero'),
  intercept: finite,
  rSquared: finite.nullable(),
  lod: finite.nullable(),
  loq: finite.nullable(),
  calibrationDate: isoDate,
  calibrationVersion: z.number().int().min(1),
  standardsUsed: z.array(StandardPointSchema),
  calibrationStatus: z.enum(CALIBRATION_STATUS),
  sentToDeviceAt: isoDate.nullable(),
});
export type Calibration = z.infer<typeof CalibrationSchema>;

export const ReagentSchema = z.object({
  reagentId: z.string().min(1),
  parameter: ParameterSchema,
  reagentName: z.string().trim().min(1).max(120),
  quantityRemaining: finite.nonnegative(),
  quantityUnit: z.string().min(1).max(16),
  quantityPerTest: finite.positive(),
  testsRemaining: z.number().int().nonnegative(),
  lowStockThreshold: z.number().int().nonnegative(),
  expiryDate: isoDate,
  batchNumber: z.string().max(64).nullable(),
  createdAt: isoDate,
});
export type Reagent = z.infer<typeof ReagentSchema>;
export const NewReagentSchema = ReagentSchema.omit({ reagentId: true, createdAt: true, testsRemaining: true });
export type NewReagent = z.infer<typeof NewReagentSchema>;

export const DeviceSchema = z.object({
  deviceId: z.string().min(1),
  deviceName: z.string().min(1),
  firmwareVersion: z.string().nullable(),
  lastConnected: isoDate.nullable(),
  lastSync: isoDate.nullable(),
  connectionMetadata: z.record(z.unknown()).nullable(),
});
export type Device = z.infer<typeof DeviceSchema>;

export const SyncMetadataSchema = z.object({
  deviceId: z.string().min(1),
  lastSyncTimestamp: isoDate.nullable(),
  lastSyncedDeviceResultId: z.string().nullable(),
  pendingSyncRecords: z.number().int().nonnegative(),
});
export type SyncMetadata = z.infer<typeof SyncMetadataSchema>;

export const ActiveTimerSchema = z.object({
  timerId: z.string().min(1),
  parameter: ParameterSchema,
  sampleId: z.string().nullable(),
  startedAt: isoDate,
  durationS: z.number().int().positive(),
  notificationId: z.string().nullable(),
});
export type ActiveTimer = z.infer<typeof ActiveTimerSchema>;
