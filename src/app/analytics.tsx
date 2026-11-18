import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { LineChart } from '@/components/charts/LineChart';
import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import { Chip } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { useParameterColor } from '@/components/domain';
import { PARAMETERS, PARAMETER_IDS, type ParameterId } from '@/config/parameters';
import { computeStats, toSeries } from '@/features/results/stats';
import { useAsync } from '@/hooks/useAsync';
import { useAppStore, useServices } from '@/store/appStore';
import { convertConcentration, formatConcentration, formatDate } from '@/utils/format';

const RANGES = { '30d': 30, '90d': 90, all: null } as const;

/** Screen 26 — Parameter analytics (A4 graphs). Working range shown for reference only — not a regulatory limit. */
export default function Analytics() {
  const { repos } = useServices();
  const units = useAppStore((s) => s.settings.units);
  const [param, setParam] = useState<ParameterId>('cr6');
  const [range, setRange] = useState<keyof typeof RANGES>('all');
  const color = useParameterColor(param);
  const data = useAsync(async () => {
    const days = RANGES[range];
    const from = days ? new Date(Date.now() - days * 86400000).toISOString() : undefined;
    return repos.results.list({ parameters: [param], from, limit: 5000 });
  }, [repos, param, range]);
  const stats = data.data ? computeStats(data.data) : null;
  const series = data.data ? toSeries(data.data).map((p) => ({ ...p, y: convertConcentration(p.y, units) })) : [];
  const wr = PARAMETERS[param].workingRange;

  return (
    <Screen title="Analytics" back testID="analytics">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {PARAMETER_IDS.map((p) => (
          <Chip key={p} label={PARAMETERS[p].shortLabel} selected={param === p} onPress={() => setParam(p)} testID={`an-${p}`} />
        ))}
      </ScrollView>
      <View style={styles.chips}>
        {(Object.keys(RANGES) as (keyof typeof RANGES)[]).map((k) => (
          <Chip key={k} label={k === 'all' ? 'All time' : `Last ${RANGES[k]} days`} selected={range === k} onPress={() => setRange(k)} />
        ))}
      </View>
      {data.loading ? (
        <LoadingState />
      ) : data.error ? (
        <ErrorState message={data.error.message} onRetry={data.reload} />
      ) : !stats?.count ? (
        <Card>
          <EmptyState icon="analytics-outline" title="No data" message={`No ${PARAMETERS[param].shortLabel} results in this period.`} />
        </Card>
      ) : (
        <>
          <Card>
            <AppText variant="title">Concentration over time ({units})</AppText>
            <LineChart points={series} color={color} reference={wr ? { y: convertConcentration(wr.max, units), label: 'top of working range' } : null} testID="an-chart" />
          </Card>
          <View style={styles.grid}>
            <Stat label="Tests" value={String(stats.count)} testID="an-count" />
            <Stat label="Mean" value={formatConcentration(stats.mean, units)} testID="an-mean" />
            <Stat label="Min" value={formatConcentration(stats.min, units)} />
            <Stat label="Max" value={formatConcentration(stats.max, units)} />
            <Stat label="Re-test rate" value={`${Math.round(stats.retestRate * 100)}%`} />
            <Stat label="Latest" value={formatDate(stats.latest?.createdAt)} />
          </View>
          {stats.valid < stats.count ? (
            <AppText variant="caption" color="muted">
              {stats.count - stats.valid} result(s) without a valid concentration are excluded from statistics.
            </AppText>
          ) : null}
        </>
      )}
    </Screen>
  );
}

function Stat({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <Card style={styles.stat}>
      <AppText variant="label" color="muted">
        {label.toUpperCase()}
      </AppText>
      <AppText variant="bodyStrong" testID={testID}>
        {value}
      </AppText>
    </Card>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, flexDirection: 'row', flexWrap: 'wrap' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  stat: { flexBasis: '30%', flexGrow: 1, padding: 12, gap: 4 },
});
