/** Ordered schema migrations. Never edit an applied migration; append a new one. */
export interface Migration {
  version: number;
  name: string;
  sql: string;
}

const v1 = `
CREATE TABLE samples (
  sample_id TEXT PRIMARY KEY NOT NULL,
  sample_name TEXT NOT NULL CHECK (length(trim(sample_name)) > 0),
  source_type TEXT NOT NULL,
  notes TEXT,
  photo_path TEXT,
  latitude REAL CHECK (latitude IS NULL OR (latitude BETWEEN -90 AND 90)),
  longitude REAL CHECK (longitude IS NULL OR (longitude BETWEEN -180 AND 180)),
  location_accuracy REAL,
  location_timestamp TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_samples_created_at ON samples(created_at);

CREATE TABLE calibrations (
  calibration_id TEXT PRIMARY KEY NOT NULL,
  parameter TEXT NOT NULL,
  slope REAL NOT NULL CHECK (slope <> 0),
  intercept REAL NOT NULL,
  r_squared REAL,
  lod REAL,
  loq REAL,
  calibration_date TEXT NOT NULL,
  calibration_version INTEGER NOT NULL CHECK (calibration_version >= 1),
  standards_used TEXT NOT NULL,
  calibration_status TEXT NOT NULL CHECK (calibration_status IN ('active','superseded','draft')),
  sent_to_device_at TEXT,
  UNIQUE (parameter, calibration_version)
);
CREATE INDEX idx_calibrations_parameter ON calibrations(parameter, calibration_status);

CREATE TABLE devices (
  device_id TEXT PRIMARY KEY NOT NULL,
  device_name TEXT NOT NULL,
  firmware_version TEXT,
  last_connected TEXT,
  last_sync TEXT,
  connection_metadata TEXT
);

CREATE TABLE test_results (
  result_id TEXT PRIMARY KEY NOT NULL,
  device_test_id TEXT NOT NULL,
  device_id TEXT NOT NULL REFERENCES devices(device_id) ON DELETE RESTRICT,
  sample_id TEXT REFERENCES samples(sample_id) ON DELETE SET NULL,
  parameter TEXT NOT NULL,
  raw_idark REAL,
  raw_iblank REAL,
  raw_isample REAL,
  absorbance REAL,
  concentration REAL,
  camera_rgb_values TEXT,
  camera_validation_status TEXT,
  retest_required INTEGER NOT NULL DEFAULT 0 CHECK (retest_required IN (0,1)),
  measurement_quality_status TEXT NOT NULL,
  device_warnings TEXT,
  dilution_factor REAL NOT NULL DEFAULT 1 CHECK (dilution_factor >= 1),
  final_reported_concentration REAL,
  calibration_id TEXT REFERENCES calibrations(calibration_id) ON DELETE RESTRICT,
  device_calibration_meta TEXT,
  firmware_version TEXT,
  device_timestamp TEXT,
  phone_timestamp TEXT NOT NULL,
  created_at TEXT NOT NULL,
  UNIQUE (device_id, device_test_id)
);
CREATE INDEX idx_results_parameter ON test_results(parameter);
CREATE INDEX idx_results_created_at ON test_results(created_at);
CREATE INDEX idx_results_sample ON test_results(sample_id);

CREATE TABLE reagents (
  reagent_id TEXT PRIMARY KEY NOT NULL,
  parameter TEXT NOT NULL,
  reagent_name TEXT NOT NULL CHECK (length(trim(reagent_name)) > 0),
  quantity_remaining REAL NOT NULL CHECK (quantity_remaining >= 0),
  quantity_unit TEXT NOT NULL DEFAULT 'mL',
  quantity_per_test REAL NOT NULL DEFAULT 1 CHECK (quantity_per_test > 0),
  tests_remaining INTEGER NOT NULL CHECK (tests_remaining >= 0),
  low_stock_threshold INTEGER NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  expiry_date TEXT NOT NULL,
  batch_number TEXT,
  created_at TEXT NOT NULL
);
CREATE INDEX idx_reagents_parameter ON reagents(parameter);
CREATE INDEX idx_reagents_expiry ON reagents(expiry_date);

CREATE TABLE settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL
);

CREATE TABLE sync_metadata (
  device_id TEXT PRIMARY KEY NOT NULL REFERENCES devices(device_id) ON DELETE CASCADE,
  last_sync_timestamp TEXT,
  last_synced_device_result_id TEXT,
  pending_sync_records INTEGER NOT NULL DEFAULT 0 CHECK (pending_sync_records >= 0)
);

CREATE TABLE active_timers (
  timer_id TEXT PRIMARY KEY NOT NULL,
  parameter TEXT NOT NULL,
  sample_id TEXT REFERENCES samples(sample_id) ON DELETE CASCADE,
  started_at TEXT NOT NULL,
  duration_s INTEGER NOT NULL CHECK (duration_s > 0),
  notification_id TEXT
);
`;

export const MIGRATIONS: readonly Migration[] = [{ version: 1, name: 'initial-schema', sql: v1 }];
