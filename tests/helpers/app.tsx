/** Screen-test harness: real services over node:sqlite + in-memory files + MockBLETransport (MOCK-BLE). */
import { render } from '@testing-library/react-native';
import type { ReactElement } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { DEFAULT_SETTINGS } from '@/database/repositories/SettingsRepository';
import type { PermissionOutcome } from '@/services/bluetooth/BLEManager';
import { MockBLETransport, MockESP32 } from '@/services/bluetooth/MockBLETransport';
import { createServices, type Services } from '@/services/container';
import { TimerService } from '@/services/notifications/TimerService';
import { useAppStore } from '@/store/appStore';
import { ThemeProvider } from '@/theme/ThemeProvider';

import { createMemoryFileStore } from './memoryFileStore';
import { openNodeDatabase } from './nodeSqliteDriver';

export interface TestApp {
  services: Services;
  transport: MockBLETransport;
  device: MockESP32;
  notifications: { scheduleNotificationAsync: jest.Mock; cancelScheduledNotificationAsync: jest.Mock; setNotificationChannelAsync: jest.Mock };
  setBlePermission: (p: PermissionOutcome) => void;
  fs: ReturnType<typeof createMemoryFileStore>;
}

export async function bootTestApp(opts: { device?: MockESP32 } = {}): Promise<TestApp> {
  const device = opts.device ?? new MockESP32({ measurementMs: 30, raw: { cr6: { idark: 100, iblank: 10100, isample: 1100 } } });
  const transport = new MockBLETransport([device]);
  let perm: PermissionOutcome = 'granted';
  const fs = createMemoryFileStore();
  const notifications = {
    scheduleNotificationAsync: jest.fn().mockResolvedValue('notif-1'),
    cancelScheduledNotificationAsync: jest.fn().mockResolvedValue(undefined),
    setNotificationChannelAsync: jest.fn().mockResolvedValue(null),
  };
  const services = await createServices({
    openDatabase: async () => openNodeDatabase(),
    fileStore: () => fs,
    transport: () => transport,
    timerService: (r) => new TimerService(r.timers, notifications as never, async () => 'granted'),
    ensureBlePermissions: async () => perm,
  });
  useAppStore.setState({ status: 'ready', services, settings: { ...DEFAULT_SETTINGS, onboardingComplete: true }, ble: services.ble?.snapshot ?? null, dataVersion: 0, bootError: null });
  services.ble?.subscribe((s) => useAppStore.getState().setBle(s));
  services.ble?.onResult(() => useAppStore.getState().touchData());
  return { services, transport, device, notifications, setBlePermission: (p) => (perm = p), fs };
}

export async function shutdownTestApp(app: TestApp): Promise<void> {
  app.services.ble?.dispose();
  await app.services.repos.db.close();
}

const metrics = { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 0, left: 0, right: 0, bottom: 0 } };

export function renderScreen(ui: ReactElement) {
  return render(
    <SafeAreaProvider initialMetrics={metrics}>
      <ThemeProvider preference="light">{ui}</ThemeProvider>
    </SafeAreaProvider>,
  );
}
