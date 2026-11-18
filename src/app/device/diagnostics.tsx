import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Divider, ListRow } from '@/components/common/ListRow';
import { StatusPill } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/States';
import { SELF_TEST_LABELS } from '@/features/device/selfTest';
import { bleErrorMessage, useBle } from '@/hooks/useBle';

/** Screen 5 — Device diagnostics. */
export default function Diagnostics() {
  const { manager, snap } = useBle();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const status = snap?.deviceStatus;
  const connected = snap?.state === 'connected';

  const refresh = async () => {
    if (!manager) return;
    setBusy(true);
    setError(null);
    try {
      await manager.refreshStatus();
    } catch (e) {
      setError(bleErrorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const entries = status ? Object.entries(status.self_test) : [];
  const anyFail = entries.some(([, v]) => v === 'fail');

  return (
    <Screen title="Diagnostics" back footer={<Button label="Refresh self-test" icon="refresh" loading={busy} disabled={!connected} onPress={() => void refresh()} testID="diag-refresh" />}>
      {!connected ? <Banner tone="warning" message="Connect the analyser to read its self-test." /> : null}
      {error ? <Banner tone="danger" message={error} /> : null}
      {anyFail ? <Banner tone="danger" title="Self-test failure" message="Do not run tests until the failing item is fixed. Results may be invalid." testID="diag-fail" /> : null}
      <Card>
        {entries.length ? (
          entries.map(([k, v], i) => (
            <View key={k}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={SELF_TEST_LABELS[k] ?? k}
                right={<StatusPill tone={v === 'pass' ? 'success' : v === 'fail' ? 'danger' : 'neutral'} label={v.toUpperCase()} testID={`diag-${k}`} />}
              />
            </View>
          ))
        ) : (
          <EmptyState icon="pulse-outline" title="No self-test data" message="The analyser has not reported a self-test yet." />
        )}
      </Card>
      {status ? (
        <AppText variant="caption" color="muted">
          Device busy: {status.busy ? 'yes' : 'no'} · Protocol errors this session: {snap?.protocolErrors ?? 0}
        </AppText>
      ) : null}
    </Screen>
  );
}
