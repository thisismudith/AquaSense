/** Reagent and settings screens (UI over node:sqlite; calibration upload over MOCK-BLE). */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import Reagents from '@/app/(tabs)/reagents';
import Settings from '@/app/(tabs)/settings';
import ReagentDetail from '@/app/reagents/[id]';
import Expiry from '@/app/reagents/expiry';
import NewReagent from '@/app/reagents/new';
import CalibrationDetail from '@/app/settings/calibration/[parameter]';
import CalibrationList from '@/app/settings/calibration/index';
import Devices from '@/app/settings/devices';
import Firmware from '@/app/settings/firmware';
import Language from '@/app/settings/language';
import SafetyInfo from '@/app/settings/safety';
import ThemeScreen from '@/app/settings/theme';
import { parseStandards } from '@/features/calibration/standards';
import { groupByExpiry } from '@/features/reagents/expiry';
import { parseReagentForm, toFormValues } from '@/features/reagents/ReagentForm';
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

const base = { parameter: 'cr6' as const, reagentName: 'DPC', quantityRemaining: 10, quantityUnit: 'mL', quantityPerTest: 0.5, lowStockThreshold: 5, batchNumber: 'B1' };

describe('reagent helpers (UNIT)', () => {
  it('form parsing validates every field and real calendar dates', () => {
    const v = { ...toFormValues(null, 'nitrite'), quantityRemaining: '12,5', expiryDate: '2027-02-28' };
    expect(parseReagentForm(v)).toMatchObject({ ok: true, value: { parameter: 'nitrite', quantityRemaining: 12.5, batchNumber: null } });
    const bad = parseReagentForm({ ...v, reagentName: ' ', quantityRemaining: '-1', quantityPerTest: '0', lowStockThreshold: '2.5', expiryDate: '2027-02-30', quantityUnit: '' });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(Object.keys(bad.errors).sort()).toEqual(['expiryDate', 'lowStockThreshold', 'quantityPerTest', 'quantityRemaining', 'quantityUnit', 'reagentName']);
  });

  it('expiry grouping', () => {
    const mk = (d: string) => ({ ...base, reagentId: d, testsRemaining: 20, createdAt: '2026-01-01T00:00:00.000Z', expiryDate: d });
    const g = groupByExpiry([mk('2026-12-01'), mk('2026-11-01'), mk('2027-06-01')], new Date(2026, 10, 19));
    expect([g.expired.length, g.soon.length, g.ok.length]).toEqual([1, 1, 1]);
  });

  it('standards parser ignores blank rows, flags partial rows', () => {
    expect(parseStandards([{ c: '0', a: '0.01' }, { c: '', a: '' }, { c: '1', a: '' }, { c: '0,5', a: '0.4' }])).toEqual({
      points: [{ concentration: 0, absorbance: 0.01 }, { concentration: 0.5, absorbance: 0.4 }],
      invalidRows: [2],
    });
  });
});

describe('reagent screens 31–34', () => {
  it('31: empty state, then grouped inventory with status pills', async () => {
    const r = renderScreen(<Reagents />);
    await waitFor(() => expect(screen.getByText('No reagents recorded')).toBeTruthy());
    r.unmount();
    await app.services.repos.reagents.create({ ...base, expiryDate: '2020-01-01' });
    await app.services.repos.reagents.create({ ...base, quantityRemaining: 1, expiryDate: '2099-01-01' });
    renderScreen(<Reagents />);
    await waitFor(() => expect(screen.getByText('Expired')).toBeTruthy());
    expect(screen.getByText('Low')).toBeTruthy();
  });

  it('add reagent form validates then saves', async () => {
    renderScreen(<NewReagent />);
    fireEvent.changeText(screen.getByTestId('rf-qty'), '');
    await act(async () => fireEvent.press(screen.getByTestId('rf-submit')));
    expect(screen.getByText('Use YYYY-MM-DD')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('rf-qty'), '20');
    fireEvent.changeText(screen.getByTestId('rf-expiry'), '2027-01-31');
    await act(async () => fireEvent.press(screen.getByTestId('rf-submit')));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect((await app.services.repos.reagents.list())[0]).toMatchObject({ quantityRemaining: 20, testsRemaining: 20 });
  });

  it('32/33: details, restock, prevent negative stock', async () => {
    const g = await app.services.repos.reagents.create({ ...base, expiryDate: '2099-01-01' });
    setParams({ id: g.reagentId });
    renderScreen(<ReagentDetail />);
    await waitFor(() => expect(screen.getByTestId('rd-tests')).toHaveTextContent(/20$/));
    fireEvent.changeText(screen.getByTestId('rd-delta'), '5');
    await act(async () => fireEvent.press(screen.getByTestId('rd-apply')));
    await waitFor(() => expect(screen.getByTestId('rd-tests')).toHaveTextContent(/30$/));
    fireEvent.press(screen.getByTestId('rd-remove'));
    fireEvent.changeText(screen.getByTestId('rd-delta'), '100');
    await act(async () => fireEvent.press(screen.getByTestId('rd-apply')));
    await waitFor(() => expect(screen.getByTestId('rd-msg')).toHaveTextContent(/below zero/));
  });

  it('34: expiry sections', async () => {
    await app.services.repos.reagents.create({ ...base, expiryDate: '2020-01-01' });
    renderScreen(<Expiry />);
    await waitFor(() => expect(screen.getByTestId('exp-expired')).toHaveTextContent(/Expired — blocked \(1\)/));
  });
});

describe('settings 35–41', () => {
  it('settings hub: units switch persists and navigation', async () => {
    renderScreen(<Settings />);
    await act(async () => fireEvent.press(screen.getByTestId('set-unit-µg/L')));
    expect(useAppStore.getState().settings.units).toBe('µg/L');
    expect(await app.services.repos.settings.get('units')).toBe('µg/L');
    fireEvent.press(screen.getByTestId('set-calibration'));
    expect(router.push).toHaveBeenCalledWith('/settings/calibration');
    await act(async () => fireEvent(screen.getByTestId('set-alerts'), 'valueChange', false));
    expect((await app.services.repos.settings.get('notificationPreferences')).timerAlerts).toBe(false);
  });

  it('35: devices list, preferences, cannot forget device with results', async () => {
    await app.services.repos.devices.upsert({ deviceId: 'dev-1', deviceName: 'Old analyser' });
    await app.services.repos.results.insert(makeResult());
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.style === 'destructive')?.onPress?.());
    renderScreen(<Devices />);
    await waitFor(() => expect(screen.getByTestId('dev-dev-1')).toBeTruthy());
    await act(async () => fireEvent.press(screen.getByTestId('dev-dev-1')));
    await waitFor(() => expect(screen.getByTestId('dev-msg')).toHaveTextContent(/cannot be removed/));
    await act(async () => fireEvent(screen.getByTestId('dev-autoreconnect'), 'valueChange', false));
    expect((await app.services.repos.settings.get('devicePreferences')).autoReconnect).toBe(false);
    alert.mockRestore();
  });

  it('36: enter standards → fit preview → save version → send to analyser (MOCK-BLE)', async () => {
    await act(() => app.services.ble!.connect(app.device.bleId).then(() => undefined));
    setParams({ parameter: 'cr6' });
    renderScreen(<CalibrationDetail />);
    expect(screen.getByTestId('fit-error')).toHaveTextContent(/at least 2 standards/);
    const pts = [
      ['0', '0.05'],
      ['0.5', '0.45'],
      ['1', '0.85'],
    ];
    pts.forEach(([c, a], i) => {
      fireEvent.changeText(screen.getByTestId(`std-c-${i}`), c!);
      fireEvent.changeText(screen.getByTestId(`std-a-${i}`), a!);
    });
    expect(screen.getByTestId('fit-slope')).toHaveTextContent(/0\.80000$/);
    expect(screen.getByTestId('fit-r2')).toHaveTextContent(/1\.00000$/);
    await act(async () => fireEvent.press(screen.getByTestId('cal-save')));
    await waitFor(() => expect(screen.getByTestId('cal-msg')).toHaveTextContent(/Saved as v1/));
    await act(async () => fireEvent.press(screen.getByTestId('cal-send-1')));
    await waitFor(() => expect(screen.getByTestId('cal-msg')).toHaveTextContent(/v1 sent/));
    expect(app.device.calibrations.cr6).toEqual({ slope: expect.closeTo(0.8, 10), intercept: expect.closeTo(0.05, 10), version: 1 });
    expect(screen.getByTestId('cal-device')).toHaveTextContent(/v1/);
  });

  it('36: identical concentrations are rejected; overview shows status', async () => {
    setParams({ parameter: 'nitrite' });
    const r = renderScreen(<CalibrationDetail />);
    fireEvent.changeText(screen.getByTestId('std-c-0'), '1');
    fireEvent.changeText(screen.getByTestId('std-a-0'), '0.1');
    fireEvent.changeText(screen.getByTestId('std-c-1'), '1');
    fireEvent.changeText(screen.getByTestId('std-a-1'), '0.2');
    expect(screen.getByTestId('fit-error')).toHaveTextContent(/different concentrations/);
    expect(screen.getByTestId('cal-save')).toBeDisabled();
    r.unmount();
    await app.services.repos.calibrations.saveNewVersion({ parameter: 'nitrite', slope: 1, intercept: 0, rSquared: 0.99, lod: null, loq: null, standardsUsed: [], status: 'active' });
    renderScreen(<CalibrationList />);
    await waitFor(() => expect(screen.getByText('Not sent')).toBeTruthy());
  });

  it('37 firmware, 38 language, 39 theme, 41 safety', async () => {
    let r = renderScreen(<Firmware />);
    expect(screen.getByText(/Over-the-air update is not available/)).toBeTruthy();
    r.unmount();
    r = renderScreen(<Language />);
    await act(async () => fireEvent.press(screen.getByTestId('lang-en')));
    r.unmount();
    r = renderScreen(<ThemeScreen />);
    await act(async () => fireEvent.press(screen.getByTestId('theme-dark')));
    expect(await app.services.repos.settings.get('theme')).toBe('dark');
    r.unmount();
    renderScreen(<SafetyInfo />);
    expect(screen.getAllByTestId('safety-pending')).toHaveLength(4);
  });
});
