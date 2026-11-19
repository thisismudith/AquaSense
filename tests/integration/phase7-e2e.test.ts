/// <reference types="node" />
/**
 * Phase 7 end-to-end flow at service level — MOCK-BLE + file-backed SQLite (node:sqlite) + in-memory files.
 * This is NOT a physical-device or physical-ESP32 test. It proves the app's layers work together; on-device
 * verification is done separately on a real phone and analyser.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MockBLETransport, MockESP32 } from '@/services/bluetooth/MockBLETransport';
import { createServices, type Services } from '@/services/container';
import { buildCsv } from '@/services/export/csv';
import { buildReportHtml } from '@/services/export/pdfHtml';
import { loadReportRows } from '@/services/export/reportData';
import { TimerService } from '@/services/notifications/TimerService';
import { formatConcentration } from '@/utils/format';

import { createMemoryFileStore } from '../helpers/memoryFileStore';
import { openNodeDatabase } from '../helpers/nodeSqliteDriver';

jest.mock('expo-print', () => ({}));
jest.mock('expo-sharing', () => ({}));
jest.mock('expo-image-picker', () => ({}));
jest.mock('expo-location', () => ({}));
jest.mock('expo-notifications', () => ({ AndroidImportance: { HIGH: 4 }, SchedulableTriggerInputTypes: { DATE: 'date' } }));

const waitFor = async (pred: () => boolean, ms = 3000) => {
  const t0 = Date.now();
  while (!pred()) {
    if (Date.now() - t0 > ms) throw new Error('waitFor timeout');
    await new Promise((r) => setTimeout(r, 5));
  }
};

describe('Phase 7 flow (MOCK-BLE, service level)', () => {
  const dir = mkdtempSync(join(tmpdir(), 'aquasense-e2e-'));
  const dbPath = join(dir, 'aquasense.db');
  const fs = createMemoryFileStore();
  const device = new MockESP32({ measurementMs: 40, raw: { nitrite: { idark: 150, iblank: 20150, isample: 10150 } } });
  const transport = new MockBLETransport([device]);
  const notifications = { setNotificationChannelAsync: jest.fn(async () => null), scheduleNotificationAsync: jest.fn(async () => 'n-1'), cancelScheduledNotificationAsync: jest.fn(async () => undefined) };
  const boot = () =>
    createServices({
      openDatabase: async () => openNodeDatabase(dbPath),
      fileStore: () => fs,
      transport: () => transport,
      timerService: (r) => new TimerService(r.timers, notifications as never, async () => 'granted'),
      ensureBlePermissions: async () => 'granted',
    });
  let s: Services;

  afterAll(async () => {
    s.ble?.dispose();
    await s.repos.db.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('runs steps 1–20', async () => {
    s = await boot();
    const { repos, ble } = s;
    // 1. onboarding
    await repos.settings.set('onboardingComplete', true);
    // 2–4. permission (granted), scan, connect, status
    await ble!.startScan();
    await waitFor(() => ble!.snapshot.scanResults.length === 1);
    const status = await ble!.connect(device.bleId);
    expect(status).toMatchObject({ device_id: device.deviceId, firmware: '0.9.0-mock' });
    // calibration prepared in-app and sent to the analyser
    const cal = await s.calibration.create('nitrite', [0, 0.1, 0.25, 0.5].map((c) => ({ concentration: c, absorbance: 1.2 * c + 0.002 })));
    if (!cal.ok) throw new Error(cal.error);
    await ble!.sendCalibration(cal.value);
    // 5–7. parameter, sample details, photo, location
    const sample = await repos.samples.create({ sampleName: 'Village well', sourceType: 'well', notes: 'hand pump', photoPath: null, location: { latitude: 26.9124, longitude: 75.7873, accuracy: 7, timestamp: new Date().toISOString() } });
    fs.files.set('content://picker/1', 'anBlZw==');
    await s.photos.setSamplePhoto(sample.sampleId, 'content://picker/1');
    // 8–10. safety acknowledged (UI), reagent consumed, timer started with OS notification
    const reagent = await repos.reagents.create({ parameter: 'nitrite', reagentName: 'Sulfanilamide + NED', quantityRemaining: 10, quantityUnit: 'mL', quantityPerTest: 1, lowStockThreshold: 2, expiryDate: '2099-12-31', batchNumber: 'L-1' });
    await repos.reagents.consumeForTest(reagent.reagentId);
    const started = await s.timers.start({ parameter: 'nitrite', sampleId: sample.sampleId, durationS: 600, alerts: true, vibrate: true });
    expect(started.notification).toBe('scheduled');
    expect(notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    // 11–14. measure, photometer + camera data, displayed, saved
    const result = await ble!.measure('nitrite', sample.sampleId);
    expect(result.absorbance).toBeCloseTo(Math.log10(2), 10);
    expect(result.concentration).toBeCloseTo((Math.log10(2) - cal.value.intercept) / cal.value.slope, 10);
    expect(result).toMatchObject({ cameraValidationStatus: 'agree', calibrationId: cal.value.calibrationId, measurementQualityStatus: 'ok', sampleId: sample.sampleId });
    expect(formatConcentration(result.finalReportedConcentration, 'mg/L')).toBe('0.249 mg/L');
    // 15. history
    expect((await repos.results.list({ search: 'village' })).map((r) => r.resultId)).toEqual([result.resultId]);
    // 16. PDF + CSV content
    const rows = await loadReportRows(repos, { parameters: [], from: null, to: null });
    expect(buildCsv(rows)).toContain('Village well');
    expect(buildReportHtml(rows, { title: 'R', generatedAt: new Date().toISOString(), units: 'mg/L', filterSummary: 'all', includeRaw: true })).toContain('26.91240, 75.78730');
    // 17–18. disconnect; analyser keeps measuring offline; reconnect retrieves stored result
    await ble!.disconnect();
    device.simulate('nitrite');
    await ble!.connect(device.bleId);
    expect(ble!.snapshot.lastSync).toMatchObject({ inserted: 1 });
    // 19. no duplicates on repeated sync
    expect(await ble!.syncNow()).toMatchObject({ inserted: 0 });
    expect(await repos.results.count()).toBe(2);
    await ble!.disconnect();
    s.ble?.dispose();
    await repos.db.close();

    // 20. restart → persistence
    s = await boot();
    expect(await s.repos.results.count()).toBe(2);
    expect(await s.repos.settings.get('onboardingComplete')).toBe(true);
    expect((await s.repos.samples.getById(sample.sampleId))?.photoPath).toMatch(/\/photos\//);
    expect((await s.timers.recover()).map((t) => t.timer.timerId)).toEqual([started.timer.timerId]);
    expect((await s.repos.reagents.getById(reagent.reagentId))?.testsRemaining).toBe(9);
    expect((await s.repos.calibrations.getActive('nitrite'))?.sentToDeviceAt).not.toBeNull();
    expect((await s.repos.devices.getSyncMetadata(device.deviceId)).lastSyncedDeviceResultId).toBe('T-00002');
  });
});
