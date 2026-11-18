import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Chip } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { PARAMETERS, PARAMETER_IDS, type ParameterId } from '@/config/parameters';
import { PERIODS, describe, toFilter, toRouteParams, type Period } from '@/features/reports/reportFilter';
import { useAsync } from '@/hooks/useAsync';
import { loadReportRows } from '@/services/export/reportData';
import { useServices } from '@/store/appStore';
import { useTheme } from '@/theme/ThemeProvider';

/** Screen 28 — Report generation (A6). */
export default function Reports() {
  const theme = useTheme();
  const { repos } = useServices();
  const [parameters, setParameters] = useState<ParameterId[]>([]);
  const [period, setPeriod] = useState<Period>('30d');
  const [includeRaw, setIncludeRaw] = useState(true);
  const p = { parameters, period, includeRaw };
  const count = useAsync(async () => (await loadReportRows(repos, toFilter(p))).length, [repos, parameters.join(','), period]);

  const toggle = (x: ParameterId) => setParameters((cur) => (cur.includes(x) ? cur.filter((y) => y !== x) : [...cur, x]));
  const go = (path: '/reports/preview' | '/reports/csv') => router.push({ pathname: path, params: toRouteParams(p) });

  return (
    <Screen title="Reports" back testID="reports">
      <AppText variant="label" color="muted">
        PARAMETERS
      </AppText>
      <View style={styles.chips}>
        <Chip label="All" selected={!parameters.length} onPress={() => setParameters([])} testID="rp-all" />
        {PARAMETER_IDS.map((x) => (
          <Chip key={x} label={PARAMETERS[x].shortLabel} selected={parameters.includes(x)} onPress={() => toggle(x)} testID={`rp-${x}`} />
        ))}
      </View>
      <AppText variant="label" color="muted">
        PERIOD
      </AppText>
      <View style={styles.chips}>
        {(Object.keys(PERIODS) as Period[]).map((k) => (
          <Chip key={k} label={k === 'all' ? 'All' : `${PERIODS[k]} days`} selected={period === k} onPress={() => setPeriod(k)} testID={`rp-period-${k}`} />
        ))}
      </View>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: includeRaw }} onPress={() => setIncludeRaw(!includeRaw)} style={styles.check} testID="rp-raw">
        <Ionicons name={includeRaw ? 'checkbox' : 'square-outline'} size={22} color={theme.colors.primary} />
        <AppText>Include raw readings, calibration and device metadata in the PDF</AppText>
      </Pressable>
      <Card>
        <AppText variant="title" testID="rp-count">
          {count.loading ? 'Counting…' : `${count.data ?? 0} result${count.data === 1 ? '' : 's'}`}
        </AppText>
        <AppText color="muted">{describe(p)}</AppText>
      </Card>
      <Button label="PDF report" icon="document-text-outline" disabled={!count.data} onPress={() => go('/reports/preview')} testID="rp-pdf" />
      <Button label="CSV export" icon="grid-outline" variant="secondary" disabled={!count.data} onPress={() => go('/reports/csv')} testID="rp-csv" />
      <AppText variant="caption" color="muted">
        Reports are generated on this phone. Sharing is your choice — nothing is uploaded automatically.
      </AppText>
    </Screen>
  );
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, check: { flexDirection: 'row', gap: 10, alignItems: 'center' } });
