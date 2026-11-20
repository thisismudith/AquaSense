/**
 * BLE protocol configuration — the ONLY place UUIDs and firmware-specific values live.
 *
 * ⚠ PROVISIONAL — NOT FIRMWARE-CONFIRMED (DECISIONS D4/D10). No ESP32 firmware or BLE documentation was supplied.
 * The contract below uses the published Nordic UART Service (NUS) UUIDs, a de-facto standard serial-over-BLE
 * profile commonly used on ESP32, with newline-delimited JSON frames. It is a proposed contract for the firmware
 * team, NOT a description of existing firmware. Physical verification is pending.
 */
export const BLE_PROTOCOL = {
  status: 'provisional' as 'provisional' | 'confirmed',
  protocolVersion: 1,
  /** Nordic UART Service (published UUIDs). */
  serviceUuid: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
  /** Phone → device (write / write without response). */
  rxCharacteristicUuid: '6e400002-b5a3-f393-e0a9-e50e24dcca9e',
  /** Device → phone (notify). */
  txCharacteristicUuid: '6e400003-b5a3-f393-e0a9-e50e24dcca9e',
  /** Advertised name prefix used to identify ESP32-A when the service UUID is not advertised. */
  deviceNamePrefix: 'SipSure',
  /** Prefixes from before the AquaSense → SipSure rename; still accepted so existing firmware is found. */
  legacyDeviceNamePrefixes: ['AquaSense'],
  frameDelimiter: 0x0a,
  maxFrameBytes: 8192,
  /** A partial frame older than this (no further bytes) is discarded so it cannot corrupt the next frame. */
  staleFrameMs: 500,
  requestedMtu: 185,
  defaultMtu: 23,
  timeouts: {
    scanMs: 15_000,
    connectMs: 12_000,
    commandMs: 8_000,
    /** Measurement includes dark/blank/sample/camera cycle on-device. */
    measurementMs: 120_000,
  },
  reconnect: { maxAttempts: 6, baseDelayMs: 1_000, maxDelayMs: 30_000 },
  syncBatchSize: 20,
} as const;
