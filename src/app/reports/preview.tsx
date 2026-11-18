import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Divider } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { ErrorState, LoadingState } from '@/components/common/States';
import { describe, fromRouteParams, toFilter } from '@/features/reports/reportFilter';
import { ResultRow } from '@/features/results/ResultRow';
import { useAsync } from '@/hooks/useAsync';
import { buildReportHtml } from '@/services/export/pdfHtml';
import { loadReportRows } from '@/services/export/reportData';
import { useAppStore, useServices } from '@/store/appStore';

/** Screen 29 — PDF preview (in-app summary + system print preview + save/share). */
export default function PdfPreview() {
  const q = useLocalSearchParams();
  const p = fromRouteParams(q);
  const { repos, exporter } = useServices();
  const units = useAppStore((s) => s.settings.units);
  const rows = useAsync(() => loadReportRows(repos, toFilter(p)), [repos, JSON.stringify(p)]);
  const [busy, setBusy] = useState<'preview' | 'share' | null>(null);
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null);

  const html = () => buildReportHtml(rows.data ?? [], { title: 'AquaSense water quality report', generatedAt: new Date().toISOString(), units, filterSummary: describe(p), includeRaw: p.includeRaw });

  const preview = async () => {
    setBusy('preview');
    setMsg(null);
    try {
      await exporter.previewPdf(html());
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  const share = async () => {
    setBusy('share');
    setMsg(null);
    try {
      const uri = await exporter.writePdf(html());
      const r = await exporter.share(uri, 'application/pdf', 'Share AquaSense report');
      setMsg(r.ok ? { tone: 'success', text: 'PDF saved and shared.' } : { tone: 'warning', text: `PDF saved to app storage (${uri}). Sharing is not available on this device.` });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setBusy(null);
    }
  };

  return (
    <Screen
      title="PDF report"
      back
      testID="pdf-preview"
      footer={
        <>
          <Button label="Open print preview" icon="eye-outline" variant="secondary" loading={busy === 'preview'} disabled={!rows.data?.length} onPress={() => void preview()} testID="pdf-open" />
          <Button label="Save & share PDF" icon="share-outline" loading={busy === 'share'} disabled={!rows.data?.length} onPress={() => void share()} testID="pdf-share" />
        </>
      }
    >
      {msg ? <Banner tone={msg.tone} message={msg.text} testID="pdf-msg" /> : null}
      <AppText variant="h1">AquaSense water quality report</AppText>
      <AppText color="muted">{describe(p)}</AppText>
      <Card>
        {rows.loading ? (
          <LoadingState />
        ) : rows.error ? (
          <ErrorState message={rows.error.message} onRetry={rows.reload} />
        ) : (
          rows.data?.map((row, i) => (
            <View key={row.result.resultId}>
              {i > 0 ? <Divider /> : null}
              <ResultRow r={row.result} sampleName={row.sample?.sampleName ?? null} units={units} />
            </View>
          ))
        )}
      </Card>
      <AppText variant="caption" color="muted">
        Includes date, parameter and method, sample, location, result and status{p.includeRaw ? ', raw readings, calibration and device metadata' : ''}.
      </AppText>
    </Screen>
  );
}
