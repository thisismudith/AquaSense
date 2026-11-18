import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Hero } from '@/components/common/Brand';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { CameraPill, ParameterBadge, QualityPill } from '@/components/domain';
import { PARAMETERS } from '@/config/parameters';
import { ResultGate } from '@/features/results/ResultGate';
import { useAsync } from '@/hooks/useAsync';
import { useT } from '@/i18n/useT';
import { formatCoordinates } from '@/services/location/LocationService';
import { parseCameraValidation } from '@/services/measurement/cameraValidation';
import { useAppStore, useServices } from '@/store/appStore';
import { useTheme } from '@/theme/ThemeProvider';
import { formatConcentration, formatDateTime, formatNumber } from '@/utils/format';
import type { TranslationKey } from '@/i18n';

/** Screens 18 & 25 — Result overview / individual result details (A3). */
export default function ResultOverview() {
  const t = useT();
  const theme = useTheme();
  const { photos } = useServices();
  const units = useAppStore((s) => s.settings.units);
  const [rawOpen, setRawOpen] = useState(false);

  return (
    <ResultGate title="Result">
      {({ result: r, sample, calibration }) => {
        const cam = parseCameraValidation(r.cameraValidationStatus ? { status: r.cameraValidationStatus, rgb: r.cameraRgb } : null);
        const nav = (sub: string) => router.push(`/result/${r.resultId}/${sub}` as never);
        return (
          <Screen title="Result" back testID="result-overview">
            <Hero>
              <View style={styles.heroTop}>
                <ParameterBadge parameter={r.parameter} size={44} />
                <View style={{ flex: 1 }}>
                  <AppText variant="title" style={styles.light}>
                    {t(PARAMETERS[r.parameter].labelKey as TranslationKey)}
                  </AppText>
                  <AppText variant="caption" style={styles.lightMuted}>
                    {formatDateTime(r.deviceTimestamp ?? r.createdAt)} · {r.deviceTestId}
                  </AppText>
                </View>
              </View>
              <AppText variant="monoLarge" style={styles.light} testID="result-value">
                {formatConcentration(r.finalReportedConcentration, units)}
              </AppText>
              {r.dilutionFactor > 1 ? (
                <AppText variant="caption" style={styles.lightMuted} testID="result-dilution">
                  Device reading {formatConcentration(r.concentration, units)} × dilution {r.dilutionFactor}
                </AppText>
              ) : null}
              <View style={styles.pills}>
                <QualityPill quality={r.measurementQualityStatus} />
                <CameraPill status={cam.status} raw={cam.rawStatus} />
              </View>
            </Hero>

            {r.retestRequired ? (
              <Banner tone="warning" title="Re-test recommended" message="The analyser flagged this reading. The photometer value is shown unchanged." testID="result-retest">
                <Button compact variant="secondary" label="Start re-test" onPress={() => nav('retest')} />
              </Banner>
            ) : null}
            {r.measurementQualityStatus === 'over_range' ? (
              <Banner tone="warning" title="Above the calibrated range" message="Dilute the sample and measure again.">
                <Button compact variant="secondary" label="Dilution guidance" onPress={() => nav('dilution')} />
              </Banner>
            ) : null}
            {r.concentration === null ? <Banner tone="danger" title="No valid concentration" message="The analyser did not report a concentration for this measurement. Raw readings are kept for recalculation." /> : null}
            {r.deviceWarnings.length ? (
              <Card>
                <AppText variant="title">Device warnings</AppText>
                {r.deviceWarnings.map((w) => (
                  <AppText key={w}>• {t(`warning.${w}` as TranslationKey) === `warning.${w}` ? w : t(`warning.${w}` as TranslationKey)}</AppText>
                ))}
              </Card>
            ) : null}
            {PARAMETERS[r.parameter].caveatKey ? <Banner tone="info" message={t(PARAMETERS[r.parameter].caveatKey as TranslationKey)} /> : null}

            <Card>
              <ListRow icon="analytics-outline" title="Absorbance" value={formatNumber(r.absorbance)} />
              <Pressable accessibilityRole="button" accessibilityState={{ expanded: rawOpen }} onPress={() => setRawOpen(!rawOpen)} style={styles.expand} testID="result-raw-toggle">
                <AppText variant="bodyStrong">Raw readings</AppText>
                <Ionicons name={rawOpen ? 'chevron-up' : 'chevron-down'} size={18} color={theme.colors.textMuted} />
              </Pressable>
              {rawOpen ? (
                <View testID="result-raw">
                  <ListRow title="I dark" value={formatNumber(r.rawIdark, 1)} />
                  <ListRow title="I blank" value={formatNumber(r.rawIblank, 1)} />
                  <ListRow title="I sample" value={formatNumber(r.rawIsample, 1)} />
                </View>
              ) : null}
            </Card>

            <Card>
              <ListRow icon="git-compare-outline" title="Photometer vs camera" onPress={() => nav('compare')} testID="nav-compare" />
              <ListRow icon="code-working-outline" title="Technical details" onPress={() => nav('technical')} testID="nav-technical" />
              <ListRow icon="trending-up-outline" title="Calibration" subtitle={calibration ? `v${calibration.calibrationVersion}` : 'Not linked to a local calibration'} onPress={() => nav('calibration')} testID="nav-calibration" />
              <ListRow icon="beaker-outline" title="Dilution" value={`×${r.dilutionFactor}`} onPress={() => nav('dilution')} testID="nav-dilution" />
              <ListRow icon="refresh-outline" title="Re-test" onPress={() => nav('retest')} testID="nav-retest" />
            </Card>

            <AppText variant="h2">Sample</AppText>
            <Card>
              {sample ? (
                <>
                  <ListRow icon="flask-outline" title={sample.sampleName} subtitle={t(`source.${sample.sourceType}`)} onPress={() => router.push(`/sample/${sample.sampleId}`)} />
                  {sample.notes ? <AppText color="muted">{sample.notes}</AppText> : null}
                  {sample.location ? <ListRow icon="location-outline" title="Location" subtitle={formatCoordinates(sample.location)} /> : null}
                  <SamplePhoto path={sample.photoPath} check={(p) => photos.status(p)} />
                </>
              ) : (
                <AppText color="muted">Not linked to a sample (e.g. synced from the analyser).</AppText>
              )}
            </Card>
          </Screen>
        );
      }}
    </ResultGate>
  );
}

function SamplePhoto({ path, check }: { path: string | null; check: (p: string | null) => Promise<{ kind: string; uri?: string }> }) {
  const st = useAsync(() => check(path), [path]);
  if (st.data?.kind === 'ok' && st.data.uri) return <Image source={{ uri: st.data.uri }} style={styles.photo} accessibilityLabel="Sample photo" />;
  if (st.data?.kind === 'missing') return <AppText color="warning">Photo file missing on this phone.</AppText>;
  return null;
}

const styles = StyleSheet.create({
  heroTop: { flexDirection: 'row', gap: 12, alignItems: 'center' },
  light: { color: '#FFFFFF' },
  lightMuted: { color: 'rgba(255,255,255,0.75)' },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  expand: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 12 },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: 14, marginTop: 8 },
});
