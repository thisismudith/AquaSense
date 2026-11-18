import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ScrollView } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import { ErrorState, LoadingState } from '@/components/common/States';
import { describe, fromRouteParams, toFilter } from '@/features/reports/reportFilter';
import { useAsync } from '@/hooks/useAsync';
import { buildCsv, CSV_COLUMNS } from '@/services/export/csv';
import { loadReportRows } from '@/services/export/reportData';
import { useServices } from '@/store/appStore';

/** Screen 30 — CSV export. */
export default function CsvExport() {
  const p = fromRouteParams(useLocalSearchParams());
  const { repos, exporter } = useServices();
  const data = useAsync(async () => buildCsv(await loadReportRows(repos, toFilter(p))), [repos, JSON.stringify(p)]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null);
  const lines = data.data ? data.data.split('\r\n').filter(Boolean) : [];

  const share = async () => {
    if (!data.data) return;
    setBusy(true);
    setMsg(null);
    try {
      const uri = await exporter.writeCsv(data.data);
      const r = await exporter.share(uri, 'text/csv', 'Share AquaSense CSV');
      setMsg(r.ok ? { tone: 'success', text: 'CSV saved and shared.' } : { tone: 'warning', text: `CSV saved to app storage (${uri}). Sharing is not available on this device.` });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen title="CSV export" back testID="csv-export" footer={<Button label="Save & share CSV" icon="share-outline" loading={busy} disabled={lines.length < 2} onPress={() => void share()} testID="csv-share" />}>
      {msg ? <Banner tone={msg.tone} message={msg.text} testID="csv-msg" /> : null}
      <AppText color="muted">{describe(p)}</AppText>
      {data.loading ? (
        <LoadingState />
      ) : data.error ? (
        <ErrorState message={data.error.message} onRetry={data.reload} />
      ) : (
        <>
          <AppText variant="title" testID="csv-rows">
            {Math.max(0, lines.length - 1)} rows · {CSV_COLUMNS.length} columns
          </AppText>
          <Card>
            <ScrollView horizontal>
              <AppText variant="mono" style={{ fontSize: 11 }} testID="csv-preview">
                {lines.slice(0, 6).join('\n')}
              </AppText>
            </ScrollView>
          </Card>
          <AppText variant="caption" color="muted">
            Concentrations in mg/L. UTF-8 with header row; opens in spreadsheet apps.
          </AppText>
        </>
      )}
    </Screen>
  );
}
