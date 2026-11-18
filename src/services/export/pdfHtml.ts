import { PARAMETERS } from '@/config/parameters';
import type { ConcentrationUnit } from '@/utils/format';
import { formatConcentration, formatDateTime, formatNumber } from '@/utils/format';

import { methodOf, type ReportRow } from './reportData';

export function escapeHtml(s: string | null | undefined): string {
  return (s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

const QUALITY: Record<string, string> = {
  ok: 'Valid',
  retest_required: 'Re-test needed',
  unstable: 'Unstable',
  over_range: 'Over range',
  below_detection: 'Below detection',
  invalid: 'No valid result',
};

/** Self-contained HTML (no remote assets) rendered to PDF on-device by expo-print. */
export function buildReportHtml(rows: readonly ReportRow[], opts: { title: string; generatedAt: string; units: ConcentrationUnit; filterSummary: string; includeRaw: boolean }): string {
  const body = rows
    .map(({ result: r, sample: s, calibration: c }) => {
      const loc = s?.location ? `${s.location.latitude.toFixed(5)}, ${s.location.longitude.toFixed(5)} (±${s.location.accuracy !== null ? Math.round(s.location.accuracy) : '?'} m)` : '—';
      const raw = opts.includeRaw
        ? `<tr class="raw"><td colspan="6">Idark ${formatNumber(r.rawIdark, 1)} · Iblank ${formatNumber(r.rawIblank, 1)} · Isample ${formatNumber(r.rawIsample, 1)} · A ${formatNumber(r.absorbance)} · Camera ${escapeHtml(r.cameraValidationStatus ?? '—')} · Calibration ${c ? `v${c.calibrationVersion} (m ${formatNumber(c.slope, 5)}, c ${formatNumber(c.intercept, 5)})` : '—'} · Firmware ${escapeHtml(r.firmwareVersion ?? '—')} · Test ${escapeHtml(r.deviceTestId)}${r.deviceWarnings.length ? ` · Warnings ${escapeHtml(r.deviceWarnings.join(', '))}` : ''}</td></tr>`
        : '';
      return `<tr>
        <td>${escapeHtml(formatDateTime(r.deviceTimestamp ?? r.createdAt))}</td>
        <td>${escapeHtml(PARAMETERS[r.parameter].shortLabel)}<div class="m">${escapeHtml(methodOf(r.parameter))}</div></td>
        <td>${escapeHtml(s?.sampleName ?? 'Unlinked')}<div class="m">${escapeHtml(s?.sourceType ?? '')}</div>${s?.notes ? `<div class="m">${escapeHtml(s.notes)}</div>` : ''}</td>
        <td class="num">${escapeHtml(formatConcentration(r.finalReportedConcentration, opts.units))}${r.dilutionFactor > 1 ? `<div class="m">device ${escapeHtml(formatConcentration(r.concentration, opts.units))} × ${r.dilutionFactor}</div>` : ''}</td>
        <td>${escapeHtml(QUALITY[r.measurementQualityStatus] ?? r.measurementQualityStatus)}${r.retestRequired ? '<div class="m">re-test flagged</div>' : ''}</td>
        <td>${escapeHtml(loc)}</td>
      </tr>${raw}`;
    })
    .join('\n');
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    body{font-family:-apple-system,Roboto,Helvetica,Arial,sans-serif;color:#0E1B1A;margin:28px;font-size:11px}
    h1{font-family:Georgia,serif;color:#0F4C4A;font-size:22px;margin:0 0 4px}
    .sub{color:#5B6F6D;margin-bottom:16px}
    table{width:100%;border-collapse:collapse}
    th{background:#DDF5EF;color:#0F4C4A;text-align:left;padding:6px;font-size:10px;text-transform:uppercase}
    td{border-bottom:1px solid #E3EAE9;padding:6px;vertical-align:top}
    .num{font-family:'Courier New',monospace;font-weight:bold}
    .m{color:#5B6F6D;font-size:9px}
    tr.raw td{font-size:9px;color:#2E4342;background:#F1FBF8}
    footer{margin-top:18px;color:#5B6F6D;font-size:9px}
  </style></head><body>
  <h1>${escapeHtml(opts.title)}</h1>
  <div class="sub">Generated ${escapeHtml(formatDateTime(opts.generatedAt))} on this device · ${rows.length} result(s) · ${escapeHtml(opts.filterSummary)}</div>
  <table><thead><tr><th>Date</th><th>Parameter / method</th><th>Sample</th><th>Result</th><th>Status</th><th>Location</th></tr></thead>
  <tbody>${body || '<tr><td colspan="6">No results match the selected filters.</td></tr>'}</tbody></table>
  <footer>Concentrations are photometer results reported by the AquaSense analyser (ESP32-A); the camera check validates only. Working ranges are
  method working values pending lab confirmation and are not regulatory limits. Generated offline by AquaSense.</footer>
  </body></html>`;
}
