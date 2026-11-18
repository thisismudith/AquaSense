import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Divider } from '@/components/common/ListRow';
import { Chip } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { TextField } from '@/components/forms/TextField';
import { PARAMETERS, PARAMETER_IDS, type ParameterId } from '@/config/parameters';
import { ResultRow } from '@/features/results/ResultRow';
import { useAsync } from '@/hooks/useAsync';
import { useAppStore, useServices } from '@/store/appStore';

/** Screen 24 — Test history (A4): search, parameter filter, local only. */
export default function History() {
  const { repos } = useServices();
  const units = useAppStore((s) => s.settings.units);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [filter, setFilter] = useState<ParameterId | null>(null);

  useEffect(() => {
    const h = setTimeout(() => setDebounced(query), 250);
    return () => clearTimeout(h);
  }, [query]);

  const data = useAsync(async () => {
    const results = await repos.results.list({ search: debounced, parameters: filter ? [filter] : undefined, limit: 500 });
    const names = new Map((await repos.samples.list({ limit: 100000 })).map((s) => [s.sampleId, s.sampleName]));
    return { results, names };
  }, [repos, debounced, filter]);

  return (
    <Screen title="History" testID="history" right={<Button compact variant="ghost" label="Analytics" icon="analytics-outline" onPress={() => router.push('/analytics')} />}>
      <TextField label="Search" placeholder="Sample name, notes or test ID" value={query} onChangeText={setQuery} testID="history-search" />
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        <Chip label="All" selected={filter === null} onPress={() => setFilter(null)} testID="filter-all" />
        {PARAMETER_IDS.map((p) => (
          <Chip key={p} label={PARAMETERS[p].shortLabel} selected={filter === p} onPress={() => setFilter(p)} testID={`filter-${p}`} />
        ))}
      </ScrollView>
      <Card>
        {data.loading && !data.data ? (
          <LoadingState />
        ) : data.error ? (
          <ErrorState message={data.error.message} onRetry={data.reload} />
        ) : !data.data?.results.length ? (
          <EmptyState icon="time-outline" title={debounced || filter ? 'No matching results' : 'No results yet'} message={debounced || filter ? 'Try another search or filter.' : 'Completed tests are stored here on this phone.'} />
        ) : (
          <View>
            <AppText variant="caption" color="muted" testID="history-count">
              {data.data.results.length} result{data.data.results.length === 1 ? '' : 's'}
            </AppText>
            {data.data.results.map((r, i) => (
              <View key={r.resultId}>
                {i > 0 ? <Divider /> : null}
                <ResultRow r={r} sampleName={r.sampleId ? (data.data!.names.get(r.sampleId) ?? null) : null} units={units} />
              </View>
            ))}
          </View>
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ chips: { gap: 8 } });
