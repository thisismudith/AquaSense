/**
 * Simulation Control Centre — shared contract (CP19).
 *
 * Simulation mode replaces the native BLE transport with `MockBLETransport` at boot, in any build (incl. release),
 * only when the user turns it on in Settings → Simulation. Everything it produces is visibly SIMULATED:
 * the simulated analyser has a device id starting with `SIMULATED_DEVICE_ID_PREFIX`, the app shows the mock banner,
 * and results from such a device are badged and labelled in exports.
 */
import type { ParameterId } from '@/config/parameters';

export const SIMULATED_DEVICE_ID_PREFIX = 'SIM-';
export const isSimulatedDeviceId = (deviceId: string | null | undefined): boolean =>
  !!deviceId && deviceId.startsWith(SIMULATED_DEVICE_ID_PREFIX);

export type ScenarioId =
  | 'normal_measurement'
  | 'all_parameters'
  | 'bluetooth_off'
  | 'connect_failure'
  | 'disconnect_mid_test'
  | 'reconnect_and_sync'
  | 'packet_loss'
  | 'duplicate_packets'
  | 'malformed_packets'
  | 'sensor_failure'
  | 'camera_failure'
  | 'out_of_range'
  | 'below_detection'
  | 'unstable_reading'
  | 'no_calibration'
  | 'device_busy';

export interface ScenarioInfo {
  id: ScenarioId;
  title: string;
  description: string;
  /** Measurement parameter the scenario uses, if any. */
  parameter?: ParameterId;
}

export type ScenarioOutcome = 'pass' | 'fail';

export interface ScenarioResult {
  id: ScenarioId;
  outcome: ScenarioOutcome;
  /** What the app actually did (observed), human-readable. */
  observed: string;
  /** What was expected, human-readable. */
  expected: string;
  durationMs: number;
}

export interface SimulationController {
  readonly scenarios: readonly ScenarioInfo[];
  /** Runs one scenario end-to-end against the live BLEManager + repositories and checks the app's reaction. */
  run(id: ScenarioId): Promise<ScenarioResult>;
  /** Runs every scenario sequentially; never throws (a crash becomes a 'fail' result). */
  runAll(onProgress?: (r: ScenarioResult) => void): Promise<ScenarioResult[]>;
}
