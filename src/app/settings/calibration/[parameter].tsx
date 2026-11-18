import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts/LineChart';
import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Divider, ListRow } from '@/components/common/ListRow';
import { StatusPill } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { ErrorState } from '@/components/common/States';
import { TextField } from '@/components/forms/TextField';
import { PARAMETERS, isParameterId, type ParameterId } from '@/config/parameters';
import { useAsync } from '@/hooks/useAsync';
import { bleErrorMessage, useBle } from '@/hooks/useBle';
import { parseStandards, type StandardRow as Row } from '@/features/calibration/standards';
import { MIN_STANDARDS } from '@/services/calibration/fit';
import { useAppStore, useServices } from '@/store/appStore';
import { useTheme } from '@/theme/ThemeProvider';
import { formatDate, formatNumber } from '@/utils/format';

const FIT_ERR: Record<string, string> = {
  too_few_standards: `Enter at least ${MIN_STANDARDS} standards.`,
  non_finite_value: 'All values must be numbers.',
  negative_concentration: 'Concentrations cannot be negative.',
  identical_concentrations: 'Standards need at least two different concentrations.',
  zero_slope: 'Absorbance does not change with concentration (slope is zero).',
};

function Body({ parameter }: { parameter: ParameterId }) {
  const theme = useTheme();
  const { repos, calibration } = useServices();
  const touch = useAppStore((s) => s.touchData);
  const { manager, snap } = useBle();
  const history = useAsync(() => repos.calibrations.list(parameter), [repos, parameter]);
  const [rows, setRows] = useState<Row[]>([
    { c: '', a: '' },
    { c: '', a: '' },
    { c: '', a: '' },
  ]);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { points, invalidRows } = parseStandards(rows);
  const preview = calibration.preview(points);
  const connected = snap?.state === 'connected';
  const deviceCal = snap?.deviceStatus?.calibrations[parameter];

  const setCell = (i: number, k: keyof Row, v: string) => setRows(rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const save = async () => {
    if (invalidRows.length) return setMsg({ tone: 'danger', text: `Fix row(s) ${invalidRows.map((i) => i + 1).join(', ')}.` });
    setBusy('save');
    try {
      const r = await calibration.create(parameter, points, true);
      if (!r.ok) return setMsg({ tone: 'danger', text: FIT_ERR[r.error] ?? r.error });
      touch();
      history.reload();
      setMsg({ tone: 'success', text: `Saved as v${r.value.calibrationVersion}${connected ? '. Send it to the analyser to use it for measurements.' : '. Connect the analyser to send it.'}` });
    } finally {
      setBusy(null);
    }
  };

  const send = async (id: string) => {
    if (!manager) return;
    const cal = await repos.calibrations.getById(id);
    if (!cal) return;
    setBusy(`send-${id}`);
    try {
      await manager.sendCalibration(cal);
      await manager.refreshStatus().catch(() => undefined);
      touch();
      history.reload();
      setMsg({ tone: 'success', text: `v${cal.calibrationVersion} sent to the analyser.` });
    } catch (e) {
      setMsg({ tone: 'danger', text: bleErrorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const activate = async (id: string) => {
    await repos.calibrations.activate(id);
    touch();
    history.reload();
  };

  return (
    <Screen title={`${PARAMETERS[parameter].shortLabel} calibration`} back testID="cal-detail">
      {msg ? <Banner tone={msg.tone} message={msg.text} testID="cal-msg" /> : null}
      <Card>
        <AppText variant="title">Standards</AppText>
        <AppText variant="caption" color="muted">
          Concentration of each standard ({PARAMETERS[parameter].unit}) and its absorbance measured on the analyser. Fitted as A = m·C + c.
        </AppText>
        {rows.map((r, i) => (
          <View key={i} style={styles.row}>
            <View style={styles.flex}>
              <TextField label={`C${i + 1}`} keyboardType="decimal-pad" value={r.c} onChangeText={(v) => setCell(i, 'c', v)} error={invalidRows.includes(i) ? 'Invalid' : null} testID={`std-c-${i}`} />
            </View>
            <View style={styles.flex}>
              <TextField label={`A${i + 1}`} keyboardType="decimal-pad" value={r.a} onChangeText={(v) => setCell(i, 'a', v)} testID={`std-a-${i}`} />
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={`Remove row ${i + 1}`} onPress={() => setRows(rows.filter((_, j) => j !== i))} style={styles.del} disabled={rows.length <= 2}>
              <Ionicons name="close-circle-outline" size={22} color={rows.length <= 2 ? theme.colors.border : theme.colors.textMuted} />
            </Pressable>
          </View>
        ))}
        <Button compact variant="ghost" label="Add standard" icon="add" onPress={() => setRows([...rows, { c: '', a: '' }])} testID="std-add" />
      </Card>

      <Card testID="cal-preview">
        <AppText variant="title">Fit</AppText>
        {preview.ok ? (
          <>
            <LineChart points={points.map((p) => ({ x: p.concentration, y: p.absorbance }))} height={140} />
            <ListRow title="Slope m" value={formatNumber(preview.value.slope, 5)} testID="fit-slope" />
            <ListRow title="Intercept c" value={formatNumber(preview.value.intercept, 5)} testID="fit-intercept" />
            <ListRow title="R²" value={formatNumber(preview.value.rSquared, 5)} testID="fit-r2" />
            <ListRow title="LOD / LOQ" value={preview.value.lod === null ? 'not computed' : `${formatNumber(preview.value.lod)} / ${formatNumber(preview.value.loq)}`} />
            {preview.value.rSquared < 0.99 ? <Banner tone="warning" message="R² below 0.99 — check the standards before saving." /> : null}
          </>
        ) : (
          <AppText color="muted" testID="fit-error">
            {FIT_ERR[preview.error] ?? preview.error}
          </AppText>
        )}
        <AppText variant="caption" color="muted">
          LOD/LOQ method not yet confirmed by the lab; not computed.
        </AppText>
      </Card>
      <Button label="Save as new version" disabled={!preview.ok || !!invalidRows.length} loading={busy === 'save'} onPress={() => void save()} testID="cal-save" />

      <AppText variant="h2">Versions</AppText>
      {deviceCal ? (
        <AppText variant="caption" color="muted" testID="cal-device">
          On analyser: v{deviceCal.version ?? '?'} (m {formatNumber(deviceCal.slope, 5)}, c {formatNumber(deviceCal.intercept, 5)})
        </AppText>
      ) : null}
      <Card>
        {history.data?.length ? (
          history.data.map((c, i) => (
            <View key={c.calibrationId}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={`v${c.calibrationVersion} · ${formatDate(c.calibrationDate)}`}
                subtitle={`m ${formatNumber(c.slope, 4)} · c ${formatNumber(c.intercept, 4)} · R² ${formatNumber(c.rSquared, 4)} · ${c.standardsUsed.length} standards`}
                right={<StatusPill tone={c.calibrationStatus === 'active' ? 'success' : 'neutral'} label={c.calibrationStatus} />}
              />
              <View style={styles.actions}>
                {c.calibrationStatus !== 'active' ? <Button compact variant="ghost" label="Make active" onPress={() => void activate(c.calibrationId)} testID={`cal-activate-${c.calibrationVersion}`} /> : null}
                <Button compact variant="secondary" label={c.sentToDeviceAt ? 'Re-send' : 'Send to analyser'} disabled={!connected} loading={busy === `send-${c.calibrationId}`} onPress={() => void send(c.calibrationId)} testID={`cal-send-${c.calibrationVersion}`} />
              </View>
            </View>
          ))
        ) : (
          <AppText color="muted">No calibrations yet.</AppText>
        )}
      </Card>
    </Screen>
  );
}

/** Screen 36 — Calibration detail: standards entry, fit, versioning, send to ESP32-A. */
export default function CalibrationDetail() {
  const { parameter } = useLocalSearchParams<{ parameter: string }>();
  if (!isParameterId(parameter))
    return (
      <Screen title="Calibration" back>
        <ErrorState title="Unknown parameter" />
      </Screen>
    );
  return <Body parameter={parameter} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 8, alignItems: 'flex-end' },
  flex: { flex: 1 },
  del: { paddingBottom: 12 },
  actions: { flexDirection: 'row', gap: 8, justifyContent: 'flex-end', paddingBottom: 8 },
});
