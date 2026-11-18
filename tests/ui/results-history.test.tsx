/** Results, history, analytics, samples screens (UI over node:sqlite). */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';

import History from '@/app/(tabs)/history';
import Samples from '@/app/(tabs)/samples';
import Analytics from '@/app/analytics';
import CalibrationInfo from '@/app/result/[id]/calibration';
import Compare from '@/app/result/[id]/compare';
import Dilution from '@/app/result/[id]/dilution';
import ResultOverview from '@/app/result/[id]/index';
import Retest from '@/app/result/[id]/retest';
import Technical from '@/app/result/[id]/technical';
import SampleDetail from '@/app/sample/[id]';
import { computeStats, toSeries } from '@/features/results/stats';
import { useTestFlow } from '@/store/testFlowStore';
import type { TestResult } from '@/types/domain';

import { bootTestApp, renderScreen, shutdownTestApp, type TestApp } from '../helpers/app';
import { makeResult } from '../helpers/db';
import { router, setParams } from '../helpers/routerMock';

jest.mock('expo-router', () => jest.requireActual('../helpers/routerMock').routerModule);
jest.mock('@/services/permissions/permissions', () => ({ openAppSettings: jest.fn(), requestCamera: jest.fn(), requestLocation: jest.fn(), requestNotifications: jest.fn(), requestBluetooth: jest.fn() }));

let app: TestApp;
let result: TestResult;

beforeEach(async () => {
  jest.clearAllMocks();
  app = await bootTestApp();
  const { repos } = app.services;
  await repos.devices.upsert({ deviceId: 'dev-1', deviceName: 'A' });
  const s = await repos.samples.create({ sampleName: 'Kitchen tap', sourceType: 'tap', notes: 'after flush', photoPath: null, location: { latitude: 10, longitude: 20, accuracy: 5, timestamp: '2026-11-19T10:00:00.000Z' } });
  const cal = await repos.calibrations.saveNewVersion({ parameter: 'cr6', slope: 0.8, intercept: 0.05, rSquared: 0.999, lod: null, loq: null, standardsUsed: [{ concentration: 0.05, absorbance: 0.09 }, { concentration: 1, absorbance: 0.85 }], status: 'active' });
  const ins = await repos.results.insert(
    makeResult({ deviceTestId: 'T-1', parameter: 'cr6', sampleId: s.sampleId, rawIdark: 100, rawIblank: 10100, rawIsample: 1100, absorbance: 1, concentration: 1.1875, calibrationId: cal.calibrationId, measurementQualityStatus: 'over_range', deviceWarnings: ['over_range', 'cloudy_sample'], retestRequired: true, cameraValidationStatus: 'disagree', cameraRgb: { r: 120, g: 60, b: 160 } }),
  );
  if (!ins.inserted) throw new Error('seed');
  result = ins.result;
  setParams({ id: result.resultId });
});
afterEach(() => shutdownTestApp(app));

describe('result screens 18–23', () => {
  it('overview: value, flags, warnings, expandable raw values, navigation', async () => {
    renderScreen(<ResultOverview />);
    await waitFor(() => expect(screen.getByTestId('result-value')).toHaveTextContent('1.19 mg/L'));
    expect(screen.getByTestId('result-retest')).toBeTruthy();
    expect(screen.getByText(/Cloudy or bubbly sample/)).toBeTruthy();
    expect(screen.getByText('Camera disagrees')).toBeTruthy();
    expect(screen.queryByTestId('result-raw')).toBeNull();
    fireEvent.press(screen.getByTestId('result-raw-toggle'));
    expect(screen.getByTestId('result-raw')).toHaveTextContent(/10100\.0/);
    expect(screen.getByText('10.00000° N, 20.00000° E')).toBeTruthy();
    fireEvent.press(screen.getByTestId('nav-technical'));
    expect(router.push).toHaveBeenCalledWith(`/result/${result.resultId}/technical`);
  });

  it('overview: not found', async () => {
    setParams({ id: 'missing' });
    renderScreen(<ResultOverview />);
    await waitFor(() => expect(screen.getByText('Result not found')).toBeTruthy());
  });

  it('compare: photometer reported, camera only validates', async () => {
    renderScreen(<Compare />);
    await waitFor(() => expect(screen.getByTestId('compare-swatch')).toBeTruthy());
    expect(screen.getByText(/never averaged in/)).toBeTruthy();
    expect(screen.getByText('Disagreement')).toBeTruthy();
  });

  it('technical: recomputed absorbance matches, consistency OK', async () => {
    renderScreen(<Technical />);
    await waitFor(() => expect(screen.getByTestId('tech-ok')).toBeTruthy());
    expect(screen.getByTestId('tech-recomputed')).toHaveTextContent(/1.0000$/);
  });

  it('technical: flags mismatch between reported and raw', async () => {
    await app.services.repos.db.run('UPDATE test_results SET absorbance = 0.5 WHERE result_id = ?', [result.resultId]);
    renderScreen(<Technical />);
    await waitFor(() => expect(screen.getByTestId('tech-issues')).toHaveTextContent(/absorbance_mismatch/));
  });

  it('calibration: recalculates with another version without changing the stored result', async () => {
    const v2 = await app.services.repos.calibrations.saveNewVersion({ parameter: 'cr6', slope: 1, intercept: 0, rSquared: 1, lod: null, loq: null, standardsUsed: [{ concentration: 0, absorbance: 0 }, { concentration: 2, absorbance: 2 }], status: 'active' });
    renderScreen(<CalibrationInfo />);
    await waitFor(() => expect(screen.getByTestId(`recalc-v${v2.calibrationVersion}`)).toBeTruthy());
    fireEvent.press(screen.getByTestId('recalc-v2'));
    expect(screen.getByTestId('recalc-result')).toHaveTextContent(/1\.00 mg\/L/);
    expect((await app.services.repos.results.getById(result.resultId))?.concentration).toBe(1.1875);
  });

  it('dilution: suggestion, validation, saves factor and keeps original reading', async () => {
    renderScreen(<Dilution />);
    await waitFor(() => expect(screen.getByTestId('dilution-suggest')).toHaveTextContent(/dilute 2×/));
    fireEvent.changeText(screen.getByTestId('dilution-factor'), '0.5');
    expect(screen.getByText('Dilution factor must be 1 or more.')).toBeTruthy();
    expect(screen.getByTestId('dilution-save')).toBeDisabled();
    fireEvent.press(screen.getByTestId('mode-volumes'));
    fireEvent.changeText(screen.getByTestId('dilution-sample'), '2');
    fireEvent.changeText(screen.getByTestId('dilution-total'), '10');
    expect(screen.getByTestId('dilution-preview')).toHaveTextContent(/5\.94 mg\/L/);
    await act(async () => fireEvent.press(screen.getByTestId('dilution-save')));
    await waitFor(() => expect(screen.getByTestId('dilution-msg')).toHaveTextContent(/×5/));
    const stored = await app.services.repos.results.getById(result.resultId);
    expect(stored).toMatchObject({ concentration: 1.1875, dilutionFactor: 5 });
    expect(stored?.finalReportedConcentration).toBeCloseTo(5.9375);
  });

  it('retest: lists reasons and restarts the flow on the same sample', async () => {
    renderScreen(<Retest />);
    await waitFor(() => expect(screen.getByText(/flagged this measurement/)).toBeTruthy());
    expect(screen.getByText(/Camera cross-check disagreed/)).toBeTruthy();
    fireEvent.press(screen.getByTestId('retest-start'));
    expect(useTestFlow.getState()).toMatchObject({ parameter: 'cr6', sampleId: result.sampleId });
    expect(router.push).toHaveBeenCalledWith('/test/safety');
  });
});

describe('history 24, analytics 26, samples 27', () => {
  beforeEach(async () => {
    await app.services.repos.results.insert(makeResult({ deviceTestId: 'T-2', parameter: 'nitrite', concentration: 0.2 }));
  });

  it('history: lists, filters by parameter, searches by sample name', async () => {
    renderScreen(<History />);
    await waitFor(() => expect(screen.getByTestId('history-count')).toHaveTextContent('2 results'));
    fireEvent.press(screen.getByTestId('filter-nitrite'));
    await waitFor(() => expect(screen.getByTestId('history-count')).toHaveTextContent('1 result'));
    expect(screen.getByTestId('row-T-2')).toBeTruthy();
    fireEvent.press(screen.getByTestId('filter-all'));
    fireEvent.changeText(screen.getByTestId('history-search'), 'kitchen');
    await waitFor(() => expect(screen.getByTestId('history-count')).toHaveTextContent('1 result'));
    expect(screen.getByTestId('row-T-1')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('history-search'), 'nothing-matches');
    await waitFor(() => expect(screen.getByText('No matching results')).toBeTruthy());
  });

  it('analytics: stats per parameter, empty state for parameter without data', async () => {
    renderScreen(<Analytics />);
    await waitFor(() => expect(screen.getByTestId('an-count')).toHaveTextContent('1'));
    expect(screen.getByTestId('an-mean')).toHaveTextContent('1.19 mg/L');
    fireEvent.press(screen.getByTestId('an-lead'));
    await waitFor(() => expect(screen.getByText('No data')).toBeTruthy());
  });

  it('stats helpers exclude invalid concentrations', () => {
    const rs = [{ ...result, finalReportedConcentration: 1 }, { ...result, finalReportedConcentration: null, retestRequired: false }, { ...result, finalReportedConcentration: 3 }];
    expect(computeStats(rs)).toMatchObject({ count: 3, valid: 2, mean: 2, min: 1, max: 3 });
    expect(computeStats([])).toMatchObject({ count: 0, mean: null, retestRate: 0 });
    expect(toSeries(rs)).toHaveLength(2);
  });

  it('samples list → detail edit, linked results, delete keeps results', async () => {
    renderScreen(<Samples />);
    await waitFor(() => expect(screen.getByTestId('sample-Kitchen tap')).toBeTruthy());
    fireEvent.press(screen.getByTestId('sample-Kitchen tap'));
    expect(router.push).toHaveBeenCalledWith(`/sample/${result.sampleId}`);
    screen.unmount();
    setParams({ id: result.sampleId! });
    renderScreen(<SampleDetail />);
    await waitFor(() => expect(screen.getByTestId('row-T-1')).toBeTruthy());
    fireEvent.changeText(screen.getByTestId('sd-name'), '');
    await act(async () => fireEvent.press(screen.getByTestId('sd-save')));
    expect(screen.getByText('Enter a sample name')).toBeTruthy();
    fireEvent.changeText(screen.getByTestId('sd-name'), 'Kitchen tap (renamed)');
    await act(async () => fireEvent.press(screen.getByTestId('sd-save')));
    expect((await app.services.repos.samples.getById(result.sampleId!))?.sampleName).toBe('Kitchen tap (renamed)');
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, buttons) => buttons?.find((b) => b.style === 'destructive')?.onPress?.());
    await act(async () => fireEvent.press(screen.getByTestId('sd-delete')));
    await waitFor(() => expect(router.back).toHaveBeenCalled());
    expect(await app.services.repos.samples.getById(result.sampleId!)).toBeNull();
    expect((await app.services.repos.results.getById(result.resultId))?.sampleId).toBeNull();
    alert.mockRestore();
  });
});
