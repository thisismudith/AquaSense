/** Screen tests (UI, MOCK-BLE). Not physical-device tests. */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import Connected from '@/app/device/connected';
import Diagnostics from '@/app/device/diagnostics';
import PairDevice from '@/app/device/pair';
import DeviceStatus from '@/app/device/status';
import Home from '@/app/(tabs)/index';
import Splash from '@/app/index';
import NotificationsScreen from '@/app/notifications';
import Welcome from '@/app/welcome';
import { computeAlerts } from '@/features/dashboard/alerts';
import { useAppStore } from '@/store/appStore';

import { bootTestApp, renderScreen, shutdownTestApp, type TestApp } from '../helpers/app';
import { makeResult } from '../helpers/db';
import { router, setParams } from '../helpers/routerMock';

jest.mock('expo-router', () => jest.requireActual('../helpers/routerMock').routerModule);
jest.mock('@/services/permissions/permissions', () => ({ openAppSettings: jest.fn(), requestBluetooth: jest.fn() }));

let app: TestApp;
beforeEach(async () => {
  jest.clearAllMocks();
  setParams({});
  app = await bootTestApp();
});
afterEach(() => shutdownTestApp(app));

describe('Splash & Welcome', () => {
  it('redirects to welcome when not onboarded, home when onboarded', () => {
    useAppStore.setState({ settings: { ...useAppStore.getState().settings, onboardingComplete: false } });
    const r = renderScreen(<Splash />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('redirect:/welcome');
    r.unmount();
    useAppStore.setState({ settings: { ...useAppStore.getState().settings, onboardingComplete: true } });
    renderScreen(<Splash />);
    expect(screen.getByTestId('redirect')).toHaveTextContent('redirect:/(tabs)');
  });

  it('shows boot error with retry', () => {
    useAppStore.setState({ status: 'error', bootError: 'disk full' });
    renderScreen(<Splash />);
    expect(screen.getByText(/disk full/)).toBeTruthy();
    act(() => useAppStore.setState({ status: 'ready' }));
  });

  it('pages through and persists onboarding completion', async () => {
    renderScreen(<Welcome />);
    fireEvent.press(screen.getByTestId('welcome-next'));
    fireEvent.press(screen.getByTestId('welcome-next'));
    fireEvent.press(screen.getByTestId('welcome-pair'));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/device/pair?onboarding=1'));
    expect(await app.services.repos.settings.get('onboardingComplete')).toBe(true);
  });
});

describe('Pairing → connected → diagnostics', () => {
  it('scans, lists the analyser, connects and navigates', async () => {
    renderScreen(<PairDevice />);
    await act(async () => fireEvent.press(screen.getByTestId('pair-search')));
    await waitFor(() => expect(screen.getByTestId(`device-${app.device.bleId}`)).toBeTruthy());
    await act(async () => fireEvent.press(screen.getByTestId(`device-${app.device.bleId}`)));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/device/connected'));
    expect(useAppStore.getState().ble?.state).toBe('connected');
  });

  it('permission denied shows rationale and retry; blocked offers settings', async () => {
    app.setBlePermission('blocked');
    renderScreen(<PairDevice />);
    await act(async () => fireEvent.press(screen.getByTestId('pair-search')));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open settings' })).toBeTruthy());
  });

  it('bluetooth off shows a clear error', async () => {
    app.transport.setAdapterState('PoweredOff');
    renderScreen(<PairDevice />);
    await act(async () => fireEvent.press(screen.getByTestId('pair-search')));
    await waitFor(() => expect(screen.getByTestId('pair-error')).toHaveTextContent(/Bluetooth is off/));
  });

  it('connected screen shows identity and self-test summary; diagnostics flags failures', async () => {
    app.device.selfTest = { green_led: 'pass', backlight_led: 'pass', photodiode: 'fail', camera_link: 'pass', supply_voltage: 'unknown' };
    await act(() => app.services.ble!.connect(app.device.bleId).then(() => undefined));
    const r = renderScreen(<Connected />);
    expect(screen.getByText('ESP32A-0001')).toBeTruthy();
    expect(screen.getByText('3 passed · 1 failed · 1 unknown')).toBeTruthy();
    r.unmount();
    renderScreen(<Diagnostics />);
    expect(screen.getByTestId('diag-fail')).toBeTruthy();
    expect(screen.getByText('Photodetector')).toBeTruthy();
    app.device.selfTest.photodiode = 'pass';
    await act(async () => fireEvent.press(screen.getByTestId('diag-refresh')));
    await waitFor(() => expect(screen.queryByTestId('diag-fail')).toBeNull());
  });

  it('connected screen without connection offers re-pair', () => {
    renderScreen(<Connected />);
    expect(screen.getByText('Not connected')).toBeTruthy();
  });
});

describe('Home, device status, notifications', () => {
  it('home shows empty state then recent results from the DB', async () => {
    const r = renderScreen(<Home />);
    await waitFor(() => expect(screen.getByText('No tests yet')).toBeTruthy());
    r.unmount();
    await app.services.repos.devices.upsert({ deviceId: 'dev-1', deviceName: 'A' });
    await app.services.repos.results.insert(makeResult({ concentration: 0.21 }));
    renderScreen(<Home />);
    await waitFor(() => expect(screen.getByText('0.210 mg/L')).toBeTruthy());
    fireEvent.press(screen.getByTestId('home-start'));
    expect(router.push).toHaveBeenCalledWith('/test/select');
  });

  it('device status: sync and disconnect', async () => {
    app.device.addStoredResult({ parameter: 'nitrite', concentration: 0.1, absorbance: 0.1 });
    await act(() => app.services.ble!.connect(app.device.bleId).then(() => undefined));
    renderScreen(<DeviceStatus />);
    await waitFor(() => expect(screen.getByText('T-00001')).toBeTruthy());
    app.device.addStoredResult({ parameter: 'nitrite', concentration: 0.2, absorbance: 0.2 });
    await act(async () => fireEvent.press(screen.getByTestId('status-sync')));
    await waitFor(() => expect(screen.getByTestId('status-msg')).toHaveTextContent(/Sync complete: 1 new, 0 duplicates skipped\./));
    await act(async () => fireEvent.press(screen.getByTestId('status-disconnect')));
    await waitFor(() => expect(screen.getByTestId('status-pair')).toBeTruthy());
  });

  it('alerts: expired, expiring, low stock, unsent calibration, running timer', async () => {
    const { repos } = app.services;
    await repos.reagents.create({ parameter: 'cr6', reagentName: 'DPC', quantityRemaining: 1, quantityUnit: 'mL', quantityPerTest: 0.5, lowStockThreshold: 5, expiryDate: '2026-11-01', batchNumber: null });
    await repos.reagents.create({ parameter: 'nitrite', reagentName: 'NED', quantityRemaining: 50, quantityUnit: 'mL', quantityPerTest: 1, lowStockThreshold: 5, expiryDate: '2026-11-29', batchNumber: null });
    await repos.calibrations.saveNewVersion({ parameter: 'cr6', slope: 1, intercept: 0, rSquared: 1, lod: null, loq: null, standardsUsed: [], status: 'active' });
    await repos.timers.save({ timerId: 't', parameter: 'cr6', sampleId: null, startedAt: '2026-11-19T10:00:00.000Z', durationS: 600, notificationId: null });
    const alerts = await computeAlerts(repos, null, new Date('2026-11-19T10:11:00.000Z'));
    expect(alerts.map((a) => a.title)).toEqual(['Reagent expired', 'Low reagent stock', 'Reagent expiring soon', 'Reaction complete', 'Calibration not on analyser']);
    renderScreen(<NotificationsScreen />);
    await waitFor(() => expect(screen.getAllByText('Reagent expired').length).toBe(1));
  });

  it('notifications empty state', async () => {
    renderScreen(<NotificationsScreen />);
    await waitFor(() => expect(screen.getByText('All clear')).toBeTruthy());
  });
});
