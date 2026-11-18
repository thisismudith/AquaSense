/** Guided test workflow screens (UI + MOCK-BLE + mocked camera/location/notification modules). */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';

import Complete from '@/app/test/complete';
import LocationStep from '@/app/test/location';
import MeasureStep from '@/app/test/measure';
import PhotoStep from '@/app/test/photo';
import ReagentStep from '@/app/test/reagent';
import SafetyStep from '@/app/test/safety';
import SampleDetails from '@/app/test/sample';
import SelectTest from '@/app/test/select';
import TimerStep from '@/app/test/timer';
import { durationOptions } from '@/features/testing/steps';
import { useTestFlow } from '@/store/testFlowStore';

import { bootTestApp, renderScreen, shutdownTestApp, type TestApp } from '../helpers/app';
import { router, setParams } from '../helpers/routerMock';

jest.mock('expo-router', () => jest.requireActual('../helpers/routerMock').routerModule);
jest.mock('expo-image-picker', () => ({
  getCameraPermissionsAsync: jest.fn(),
  requestCameraPermissionsAsync: jest.fn(),
  launchCameraAsync: jest.fn(),
  launchImageLibraryAsync: jest.fn(),
}));
jest.mock('expo-location', () => ({
  getForegroundPermissionsAsync: jest.fn(),
  requestForegroundPermissionsAsync: jest.fn(),
  hasServicesEnabledAsync: jest.fn(async () => true),
  getCurrentPositionAsync: jest.fn(),
  Accuracy: { High: 4 },
}));
jest.mock('expo-notifications', () => ({
  getPermissionsAsync: jest.fn(async () => ({ granted: true, canAskAgain: true, status: 'granted' })),
  requestPermissionsAsync: jest.fn(),
  AndroidImportance: { HIGH: 4 },
  SchedulableTriggerInputTypes: { DATE: 'date' },
}));

// eslint-disable-next-line import/first
import * as ImagePicker from 'expo-image-picker';
// eslint-disable-next-line import/first
import * as Location from 'expo-location';

let app: TestApp;
const granted = { granted: true, canAskAgain: true, status: 'granted' };
const blocked = { granted: false, canAskAgain: false, status: 'denied' };

beforeEach(async () => {
  jest.clearAllMocks();
  setParams({});
  useTestFlow.getState().reset();
  app = await bootTestApp();
});
afterEach(() => shutdownTestApp(app));

async function newSample() {
  const s = await app.services.repos.samples.create({ sampleName: 'Well 3', sourceType: 'well', notes: null, photoPath: null, location: null });
  useTestFlow.getState().start('cr6');
  useTestFlow.getState().patch({ sampleId: s.sampleId });
  return s;
}

describe('Screen 9 — selection', () => {
  it('lists parameters with reagent/calibration status and starts the flow', async () => {
    await app.services.repos.reagents.create({ parameter: 'nitrite', reagentName: 'NED', quantityRemaining: 10, quantityUnit: 'mL', quantityPerTest: 1, lowStockThreshold: 2, expiryDate: '2099-01-01', batchNumber: null });
    renderScreen(<SelectTest />);
    await waitFor(() => expect(screen.getByText('1 reagent batch')).toBeTruthy());
    expect(screen.getByText(/Range pending calibration/)).toBeTruthy(); // lead
    fireEvent.press(screen.getByTestId('param-nitrite'));
    expect(useTestFlow.getState().parameter).toBe('nitrite');
    expect(router.push).toHaveBeenCalledWith('/test/sample');
  });
});

describe('Screen 10 — sample details', () => {
  it('validates and creates the sample', async () => {
    useTestFlow.getState().start('cr6');
    renderScreen(<SampleDetails />);
    await act(async () => fireEvent.press(screen.getByTestId('sample-continue')));
    expect(screen.getByText('Enter a sample name')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('sample-name'), '  River bend ');
    fireEvent.press(screen.getByTestId('source-river'));
    await act(async () => fireEvent.press(screen.getByTestId('sample-continue')));
    const id = useTestFlow.getState().sampleId!;
    expect(await app.services.repos.samples.getById(id)).toMatchObject({ sampleName: 'River bend', sourceType: 'river' });
    expect(router.push).toHaveBeenCalledWith('/test/photo');
  });

  it('guards steps when no flow started', () => {
    renderScreen(<PhotoStep />);
    expect(screen.getByTestId('flow-restart')).toBeTruthy();
  });
});

describe('Screen 11 — photo', () => {
  it('gallery pick stores a private copy; camera blocked shows settings; remove deletes', async () => {
    const s = await newSample();
    app.fs.files.set('content://p/1', 'aGk=');
    (ImagePicker.launchImageLibraryAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'content://p/1' }] });
    renderScreen(<PhotoStep />);
    await waitFor(() => expect(screen.getByTestId('photo-none')).toBeTruthy());
    await act(async () => fireEvent.press(screen.getByTestId('photo-gallery')));
    await waitFor(() => expect(screen.getByTestId('photo-preview')).toBeTruthy());
    const stored = (await app.services.repos.samples.getById(s.sampleId))!.photoPath!;
    expect(stored.startsWith(app.services.photos.dir)).toBe(true);

    (ImagePicker.getCameraPermissionsAsync as jest.Mock).mockResolvedValue(blocked);
    await act(async () => fireEvent.press(screen.getByTestId('photo-camera')));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Open settings' })).toBeTruthy());

    await act(async () => fireEvent.press(screen.getByTestId('photo-remove')));
    await waitFor(() => expect(screen.getByTestId('photo-none')).toBeTruthy());
    expect(app.fs.files.has(stored)).toBe(false);
  });

  it('missing photo file is reported', async () => {
    const s = await newSample();
    await app.services.repos.samples.update(s.sampleId, { photoPath: `${app.services.photos.dir}/gone.jpg` });
    renderScreen(<PhotoStep />);
    await waitFor(() => expect(screen.getByTestId('photo-missing')).toBeTruthy());
  });
});

describe('Screen 12 — location', () => {
  it('captures coordinates; services off shows message', async () => {
    const s = await newSample();
    (Location.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue(granted);
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({ coords: { latitude: 28.6139, longitude: 77.209, accuracy: 9.6 }, timestamp: Date.now() });
    renderScreen(<LocationStep />);
    await act(async () => fireEvent.press(screen.getByTestId('loc-capture')));
    await waitFor(() => expect(screen.getByText('28.61390° N, 77.20900° E')).toBeTruthy());
    expect((await app.services.repos.samples.getById(s.sampleId))?.location?.accuracy).toBe(9.6);
    (Location.hasServicesEnabledAsync as jest.Mock).mockResolvedValueOnce(false);
    await act(async () => fireEvent.press(screen.getByTestId('loc-capture')));
    await waitFor(() => expect(screen.getByTestId('loc-error')).toHaveTextContent(/Location services are turned off/));
  });
});

describe('Screen 13 — safety', () => {
  it('shows pending-verification notice (no invented text) and requires acknowledgement', async () => {
    await newSample();
    renderScreen(<SafetyStep />);
    expect(screen.getByTestId('safety-pending')).toBeTruthy();
    expect(screen.getByText('Extra care')).toBeTruthy();
    expect(screen.getByTestId('safety-continue')).toBeDisabled();
    fireEvent.press(screen.getByTestId('safety-ack'));
    expect(screen.getByTestId('safety-continue')).toBeEnabled();
  });
});

describe('Screen 14 — reagent', () => {
  it('blocks expired batches, consumes stock for the chosen batch once', async () => {
    await newSample();
    const { repos } = app.services;
    const expired = await repos.reagents.create({ parameter: 'cr6', reagentName: 'DPC old', quantityRemaining: 5, quantityUnit: 'mL', quantityPerTest: 0.5, lowStockThreshold: 1, expiryDate: '2020-01-01', batchNumber: 'OLD' });
    const good = await repos.reagents.create({ parameter: 'cr6', reagentName: 'DPC', quantityRemaining: 5, quantityUnit: 'mL', quantityPerTest: 0.5, lowStockThreshold: 1, expiryDate: '2099-01-01', batchNumber: 'NEW' });
    renderScreen(<ReagentStep />);
    await waitFor(() => expect(screen.getByText('Expired')).toBeTruthy());
    fireEvent.press(screen.getByTestId(`reagent-${expired.reagentId}`));
    expect(useTestFlow.getState().reagentId).toBeNull();
    fireEvent.press(screen.getByTestId(`reagent-${good.reagentId}`));
    await act(async () => fireEvent.press(screen.getByTestId('reagent-continue')));
    expect((await repos.reagents.getById(good.reagentId))?.testsRemaining).toBe(9);
    await act(async () => fireEvent.press(screen.getByTestId('reagent-continue')));
    expect((await repos.reagents.getById(good.reagentId))?.testsRemaining).toBe(9);
    expect(router.push).toHaveBeenCalledWith('/test/timer');
  });
});

describe('Screen 15 — timer', () => {
  it('duration options stay within the working window; lead has none', () => {
    expect(durationOptions('cr6')).toEqual([300, 450, 600]);
    expect(durationOptions('lead')).toEqual([]);
  });

  it('starts with an OS notification, persists, recovers on remount, cancels', async () => {
    await newSample();
    const r = renderScreen(<TimerStep />);
    expect(screen.getByTestId('timer-clock')).toHaveTextContent('05:00');
    await act(async () => fireEvent.press(screen.getByTestId('timer-start')));
    await waitFor(() => expect(screen.getByTestId('timer-scheduled')).toBeTruthy());
    expect(app.notifications.scheduleNotificationAsync).toHaveBeenCalledTimes(1);
    expect(await app.services.repos.timers.list()).toHaveLength(1);
    r.unmount();
    renderScreen(<TimerStep />); // simulated restart of the screen
    await waitFor(() => expect(screen.getByTestId('timer-cancel')).toBeTruthy());
    await act(async () => fireEvent.press(screen.getByTestId('timer-cancel')));
    expect(app.notifications.cancelScheduledNotificationAsync).toHaveBeenCalledWith('notif-1');
    expect(await app.services.repos.timers.list()).toEqual([]);
  });

  it('lead requires a manual reaction time', async () => {
    const s = await app.services.repos.samples.create({ sampleName: 'Pb', sourceType: 'tap', notes: null, photoPath: null, location: null });
    useTestFlow.getState().start('lead');
    useTestFlow.getState().patch({ sampleId: s.sampleId });
    renderScreen(<TimerStep />);
    await act(async () => fireEvent.press(screen.getByTestId('timer-start')));
    expect(screen.getByTestId('timer-error')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('timer-manual'), '7');
    await act(async () => fireEvent.press(screen.getByTestId('timer-start')));
    expect((await app.services.repos.timers.list())[0]?.durationS).toBe(420);
  });
});

describe('Screens 16–17 — measurement & completion (MOCK-BLE)', () => {
  it('not connected → connect prompt', async () => {
    await newSample();
    renderScreen(<MeasureStep />);
    fireEvent.press(screen.getByTestId('measure-connect'));
    expect(router.push).toHaveBeenCalledWith('/device/pair');
  });

  it('measures, stores the result linked to the sample, shows completion', async () => {
    const s = await newSample();
    const { ble, repos } = app.services;
    await act(() => ble!.connect(app.device.bleId).then(() => undefined));
    const cal = await repos.calibrations.saveNewVersion({ parameter: 'cr6', slope: 0.8, intercept: 0.05, rSquared: 1, lod: null, loq: null, standardsUsed: [], status: 'active' });
    await act(() => ble!.sendCalibration(cal));
    await act(() => ble!.refreshStatus().then(() => undefined));
    const r = renderScreen(<MeasureStep />);
    expect(screen.queryByTestId('measure-nocal')).toBeNull();
    await act(async () => fireEvent.press(screen.getByTestId('measure-start')));
    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/test/complete'));
    const resultId = useTestFlow.getState().resultId!;
    const stored = await repos.results.getById(resultId);
    expect(stored).toMatchObject({ sampleId: s.sampleId, calibrationId: cal.calibrationId, measurementQualityStatus: 'ok' });
    r.unmount();
    renderScreen(<Complete />);
    await waitFor(() => expect(screen.getByTestId('complete-value')).toHaveTextContent('1.19 mg/L'));
    fireEvent.press(screen.getByTestId('complete-open'));
    expect(router.replace).toHaveBeenCalledWith(`/result/${resultId}`);
  });

  it('warns when the analyser has no calibration for the parameter', async () => {
    await newSample();
    await act(() => app.services.ble!.connect(app.device.bleId).then(() => undefined));
    renderScreen(<MeasureStep />);
    expect(screen.getByTestId('measure-nocal')).toBeTruthy();
  });
});
