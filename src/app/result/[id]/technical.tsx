import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { ResultGate } from '@/features/results/ResultGate';
import { computeAbsorbance } from '@/services/measurement/photometry';
import { checkConsistency } from '@/services/measurement/quality';
import { formatDateTime, formatNumber } from '@/utils/format';

/** Screen 20 — Technical measurement details (raw values, dark correction, consistency check). */
export default function Technical() {
  return (
    <ResultGate title="Technical details">
      {({ result: r, calibration }) => {
        const a = computeAbsorbance({ idark: r.rawIdark, iblank: r.rawIblank, isample: r.rawIsample });
        const meta = r.deviceCalibrationMeta as { slope?: number; intercept?: number } | null;
        const cal = calibration ?? (meta && typeof meta.slope === 'number' && typeof meta.intercept === 'number' ? { slope: meta.slope, intercept: meta.intercept } : null);
        const check = checkConsistency(r, cal);
        return (
          <Screen title="Technical details" back testID="technical">
            <Card>
              <AppText variant="title">Raw intensities (device-averaged)</AppText>
              <ListRow title="I dark" value={formatNumber(r.rawIdark, 2)} />
              <ListRow title="I blank" value={formatNumber(r.rawIblank, 2)} />
              <ListRow title="I sample" value={formatNumber(r.rawIsample, 2)} />
              <ListRow title="I blank − I dark" value={a.ok ? formatNumber(a.value.correctedBlank, 2) : '—'} />
              <ListRow title="I sample − I dark" value={a.ok ? formatNumber(a.value.correctedSample, 2) : '—'} />
            </Card>
            <Card>
              <AppText variant="title">Absorbance</AppText>
              <AppText variant="mono" color="muted">
                A = log10((Ib − Id) / (Is − Id))
              </AppText>
              <ListRow title="Reported by analyser" value={formatNumber(r.absorbance)} />
              <ListRow title="Recomputed from raw" value={formatNumber(check.recomputedAbsorbance)} testID="tech-recomputed" />
              <AppText variant="mono" color="muted">
                C = (A − c) / m
              </AppText>
              <ListRow title="Concentration reported" value={formatNumber(r.concentration)} />
              <ListRow title="Recomputed with calibration" value={formatNumber(check.recomputedConcentration)} />
            </Card>
            {check.issues.length ? (
              <Banner tone="warning" title="Consistency check" message={check.issues.join(', ')} testID="tech-issues" />
            ) : (
              <Banner tone="success" message="Reported values are consistent with the raw readings." testID="tech-ok" />
            )}
            <Card>
              <ListRow title="Device test ID" value={r.deviceTestId} />
              <ListRow title="Device ID" value={r.deviceId} />
              <ListRow title="Firmware" value={r.firmwareVersion ?? '—'} />
              <ListRow title="Device time" value={formatDateTime(r.deviceTimestamp)} />
              <ListRow title="Phone time" value={formatDateTime(r.phoneTimestamp)} />
              <ListRow title="Device calibration" value={meta ? JSON.stringify(meta) : '—'} />
            </Card>
          </Screen>
        );
      }}
    </ResultGate>
  );
}
