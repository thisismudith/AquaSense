/** Reports (PDF/CSV) and backup/restore screens. expo-print / expo-sharing / document picker mocked — no real files shared. */
import { act, fireEvent, screen, waitFor } from '@testing-library/react-native';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';

import Reports from '@/app/reports/index';
import CsvExport from '@/app/reports/csv';
import PdfPreview from '@/app/reports/preview';
import BackupRestore from '@/app/settings/backup';
import { fromRouteParams, toFilter, toRouteParams } from '@/features/reports/reportFilter';
import { buildCsv, csvCell, CSV_COLUMNS } from '@/services/export/csv';
import { buildReportHtml, escapeHtml } from '@/services/export/pdfHtml';
import { loadReportRows } from '@/services/export/reportData';

import { bootTestApp, renderScreen, shutdownTestApp, type TestApp } from '../helpers/app';
import { makeResult } from '../helpers/db';
import { router, setParams } from '../helpers/routerMock';

jest.mock('expo-router', () => jest.requireActual('../helpers/routerMock').routerModule);
jest.mock('expo-print', () => ({ printToFileAsync: jest.fn(), printAsync: jest.fn() }));
jest.mock('expo-sharing', () => ({ isAvailableAsync: jest.fn(async () => true), shareAsync: jest.fn(async () => undefined) }));
jest.mock('expo-document-picker', () => ({ getDocumentAsync: jest.fn() }));
jest.mock('@/services/permissions/permissions', () => ({ openAppSettings: jest.fn(), requestBluetooth: jest.fn() }));

let app: TestApp;
beforeEach(async () => {
  jest.clearAllMocks();
  setParams({});
  app = await bootTestApp();
  const { repos } = app.services;
  await repos.devices.upsert({ deviceId: 'dev-1', deviceName: 'A' });
  const s = await repos.samples.create({ sampleName: '=HYPERLINK("x"), "quoted"', sourceType: 'well', notes: 'line1\nline2 <b>', photoPath: null, location: { latitude: 1.5, longitude: 2.5, accuracy: 4, timestamp: '2026-11-19T10:00:00.000Z' } });
  await repos.results.insert(makeResult({ deviceTestId: 'T-1', parameter: 'cr6', sampleId: s.sampleId, concentration: 0.3, dilutionFactor: 2 }));
  await repos.results.insert(makeResult({ deviceTestId: 'T-2', parameter: 'nitrite', concentration: null, measurementQualityStatus: 'invalid' }));
});
afterEach(() => shutdownTestApp(app));

describe('CSV / HTML builders (UNIT)', () => {
  it('escapes CSV and blocks formula injection; numbers stay numeric', () => {
    expect(csvCell('=SUM(A1)')).toBe("'=SUM(A1)");
    expect(csvCell('-1+2')).toBe("'-1+2");
    expect(csvCell(-1.5)).toBe('-1.5');
    expect(csvCell('a,"b"')).toBe('"a,""b"""');
    expect(csvCell('x\ny')).toBe('"x\ny"');
    expect(csvCell(Number.NaN)).toBe('');
    expect(csvCell(null)).toBe('');
  });

  it('builds one row per result with all columns, mg/L, BOM + CRLF', async () => {
    const rows = await loadReportRows(app.services.repos, { parameters: [], from: null, to: null });
    const csv = buildCsv(rows);
    expect(csv.startsWith('﻿result_id,')).toBe(true);
    const lines = csv.slice(1).split('\r\n').filter(Boolean);
    expect(lines).toHaveLength(3);
    expect(csv).toContain(`"'=HYPERLINK(""x""), ""quoted"""`);
    expect(csv).toContain('"line1\nline2 <b>"');
    expect(csv).toContain(',mg/L,0.3,2,0.6,');
    expect(lines[0]!.split(',')).toHaveLength(CSV_COLUMNS.length);
  });

  it('HTML report escapes user text and never shows a number for invalid results', async () => {
    expect(escapeHtml('<script>"&\'')).toBe('&lt;script&gt;&quot;&amp;&#39;');
    const rows = await loadReportRows(app.services.repos, { parameters: [], from: null, to: null });
    const html = buildReportHtml(rows, { title: 'T', generatedAt: '2026-11-19T10:00:00.000Z', units: 'mg/L', filterSummary: 'all', includeRaw: true });
    expect(html).not.toContain('<b>');
    expect(html).toContain('line1');
    expect(html).toContain('No valid result');
    expect(html).toContain('device 0.300 mg/L × 2');
    expect(html).toContain('1.50000, 2.50000');
    expect(html).not.toMatch(/https?:\/\//);
  });

  it('report filter round-trips through route params', () => {
    const p = { parameters: ['cr6' as const, 'lead' as const], period: '30d' as const, includeRaw: false };
    expect(fromRouteParams(toRouteParams(p))).toEqual(p);
    expect(fromRouteParams({ params: 'cr6,bogus', period: 'weird' })).toEqual({ parameters: ['cr6'], period: 'all', includeRaw: false });
    expect(toFilter({ ...p, period: 'all' }).from).toBeNull();
  });
});

describe('Screens 28–30', () => {
  it('28: counts results per filter and navigates with params', async () => {
    renderScreen(<Reports />);
    fireEvent.press(screen.getByTestId('rp-period-all'));
    await waitFor(() => expect(screen.getByTestId('rp-count')).toHaveTextContent('2 results'));
    fireEvent.press(screen.getByTestId('rp-cr6'));
    await waitFor(() => expect(screen.getByTestId('rp-count')).toHaveTextContent('1 result'));
    fireEvent.press(screen.getByTestId('rp-pdf'));
    expect(router.push).toHaveBeenCalledWith({ pathname: '/reports/preview', params: { params: 'cr6', period: 'all', raw: '1' } });
  });

  it('29: print preview and save & share PDF', async () => {
    (Print.printToFileAsync as jest.Mock).mockImplementation(async () => {
      app.fs.files.set('file:///cache/print.pdf', 'JVBERi0=');
      return { uri: 'file:///cache/print.pdf', numberOfPages: 1 };
    });
    setParams({ params: '', period: 'all', raw: '1' });
    renderScreen(<PdfPreview />);
    await waitFor(() => expect(screen.getByTestId('row-T-1')).toBeTruthy());
    await act(async () => fireEvent.press(screen.getByTestId('pdf-open')));
    expect(Print.printAsync).toHaveBeenCalledWith({ html: expect.stringContaining('AquaSense water quality report') });
    await act(async () => fireEvent.press(screen.getByTestId('pdf-share')));
    await waitFor(() => expect(screen.getByTestId('pdf-msg')).toHaveTextContent(/PDF saved and shared/));
    const [uri, opts] = (Sharing.shareAsync as jest.Mock).mock.calls[0];
    expect(uri).toMatch(/\/exports\/aquasense-report-.*\.pdf$/);
    expect(opts).toMatchObject({ mimeType: 'application/pdf' });
    expect(app.fs.files.has('file:///cache/print.pdf')).toBe(false);
  });

  it('30: CSV preview and share; sharing unavailable falls back to saved path', async () => {
    setParams({ params: '', period: 'all', raw: '0' });
    renderScreen(<CsvExport />);
    await waitFor(() => expect(screen.getByTestId('csv-rows')).toHaveTextContent(/^2 rows/));
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    await act(async () => fireEvent.press(screen.getByTestId('csv-share')));
    await waitFor(() => expect(screen.getByTestId('csv-msg')).toHaveTextContent(/Sharing is not available/));
    const saved = [...app.fs.files.keys()].find((k) => k.endsWith('.csv'));
    expect(saved).toBeDefined();
  });
});

describe('Screen 40 — backup & restore', () => {
  it('creates a backup file and shares it', async () => {
    renderScreen(<BackupRestore />);
    await act(async () => fireEvent.press(screen.getByTestId('backup-create')));
    await waitFor(() => expect(screen.getByTestId('backup-msg')).toHaveTextContent(/2 results, 1 samples/));
    expect((Sharing.shareAsync as jest.Mock).mock.calls[0][1]).toMatchObject({ mimeType: 'application/json' });
  });

  it('rejects an invalid file without changing data', async () => {
    app.fs.files.set('file:///cache/bad.json', Buffer.from('{"format":"nope","version":1}').toString('base64'));
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/bad.json', name: 'bad.json' }] });
    renderScreen(<BackupRestore />);
    await act(async () => fireEvent.press(screen.getByTestId('backup-pick')));
    await waitFor(() => expect(screen.getByTestId('backup-msg')).toHaveTextContent(/Not an AquaSense backup/));
    expect(screen.queryByTestId('backup-summary')).toBeNull();
  });

  it('restores a valid backup into another install and reports results', async () => {
    const json = JSON.stringify(await app.services.backup.createBackup());
    const other = await bootTestApp();
    other.fs.files.set('file:///cache/b.json', Buffer.from(json).toString('base64'));
    (DocumentPicker.getDocumentAsync as jest.Mock).mockResolvedValue({ canceled: false, assets: [{ uri: 'file:///cache/b.json', name: 'b.json' }] });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation((_t, _m, b) => b?.find((x) => x.text === 'Restore')?.onPress?.());
    renderScreen(<BackupRestore />);
    await act(async () => fireEvent.press(screen.getByTestId('backup-pick')));
    await waitFor(() => expect(screen.getByTestId('backup-summary')).toBeTruthy());
    await act(async () => fireEvent.press(screen.getByTestId('backup-restore')));
    await waitFor(() => expect(screen.getByTestId('backup-report')).toBeTruthy());
    expect(await other.services.repos.results.count()).toBe(2);
    alert.mockRestore();
    await shutdownTestApp(other);
  });
});
