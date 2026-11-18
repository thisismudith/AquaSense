import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Chip } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { ResultGate } from '@/features/results/ResultGate';
import type { ResultBundle } from '@/features/results/useResult';
import { useAsync } from '@/hooks/useAsync';
import { CalibrationService } from '@/services/calibration/CalibrationService';
import { useAppStore, useServices } from '@/store/appStore';
import { formatConcentration, formatDate, formatNumber } from '@/utils/format';

function CalibrationBody({ result: r, calibration }: ResultBundle) {
  const { repos } = useServices();
  const units = useAppStore((s) => s.settings.units);
  const versions = useAsync(() => repos.calibrations.list(r.parameter), [repos, r.parameter]);
  const [selected, setSelected] = useState<string | null>(null);
  const chosen = versions.data?.find((c) => c.calibrationId === selected) ?? null;
  const recalc = chosen ? CalibrationService.recalculate(r, chosen) : null;
  const meta = r.deviceCalibrationMeta as { version?: number; slope?: number; intercept?: number } | null;

  return (
    <Screen title="Calibration" back testID="result-calibration">
      <Card>
        <AppText variant="title">Used for this measurement</AppText>
        {calibration ? (
          <>
            <ListRow title="Version" value={`v${calibration.calibrationVersion}`} />
            <ListRow title="Slope m" value={formatNumber(calibration.slope, 5)} />
            <ListRow title="Intercept c" value={formatNumber(calibration.intercept, 5)} />
            <ListRow title="R²" value={formatNumber(calibration.rSquared, 5)} />
            <ListRow title="Date" value={formatDate(calibration.calibrationDate)} />
            <ListRow title="Standards" value={String(calibration.standardsUsed.length)} />
          </>
        ) : meta ? (
          <>
            <AppText color="muted">Reported by the analyser (no matching local record):</AppText>
            <ListRow title="Version" value={meta.version !== undefined ? `v${meta.version}` : '—'} />
            <ListRow title="Slope m" value={formatNumber(meta.slope ?? null, 5)} />
            <ListRow title="Intercept c" value={formatNumber(meta.intercept ?? null, 5)} />
          </>
        ) : (
          <AppText color="muted">No calibration information was reported for this measurement.</AppText>
        )}
      </Card>

      <AppText variant="h2">Recalculate</AppText>
      <AppText color="muted">Apply another calibration version to the stored raw readings. The original result is not changed.</AppText>
      <View style={styles.chips}>
        {versions.data?.map((c) => (
          <Chip key={c.calibrationId} label={`v${c.calibrationVersion}${c.calibrationStatus === 'active' ? ' (active)' : ''}`} selected={selected === c.calibrationId} onPress={() => setSelected(c.calibrationId)} testID={`recalc-v${c.calibrationVersion}`} />
        ))}
      </View>
      {versions.data && !versions.data.length ? <Banner tone="info" message="No calibrations stored on this phone for this parameter." /> : null}
      {recalc ? (
        recalc.ok ? (
          <Card testID="recalc-result">
            <ListRow title="Absorbance (from raw)" value={formatNumber(recalc.value.absorbance)} />
            <ListRow title="Concentration" value={formatConcentration(recalc.value.concentration, units)} />
            <ListRow title="With dilution" value={formatConcentration(recalc.value.finalConcentration, units)} />
            <ListRow title="Range" value={recalc.value.rangeStatus.replace('_', ' ')} />
            <ListRow title="Original (stored)" value={formatConcentration(r.concentration, units)} />
          </Card>
        ) : (
          <Banner tone="danger" title="Cannot recalculate" message={recalc.error.replace(/_/g, ' ')} testID="recalc-error" />
        )
      ) : null}
    </Screen>
  );
}

/** Screen 21 — Calibration information + historical recalculation. */
export default function CalibrationInfo() {
  return <ResultGate title="Calibration">{(b) => <CalibrationBody {...b} />}</ResultGate>;
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
