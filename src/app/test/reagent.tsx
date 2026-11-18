import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Divider, ListRow } from '@/components/common/ListRow';
import { StatusPill } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { LoadingState } from '@/components/common/States';
import { PARAMETERS, type ParameterId } from '@/config/parameters';
import { daysUntilExpiry, ExpiredReagentError, InsufficientReagentError, isExpired, isLowStock } from '@/database/repositories/ReagentRepository';
import { FlowGuard } from '@/features/testing/FlowGuard';
import { PREP_STEPS } from '@/features/testing/steps';
import { WizardProgress } from '@/features/testing/WizardHeader';
import { useAsync } from '@/hooks/useAsync';
import { useAppStore, useServices } from '@/store/appStore';
import { useTestFlow } from '@/store/testFlowStore';

function ReagentBody({ parameter }: { parameter: ParameterId }) {
  const { repos } = useServices();
  const touch = useAppStore((s) => s.touchData);
  const { reagentId, reagentConsumed, patch } = useTestFlow();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const list = useAsync(() => repos.reagents.list(parameter), [repos, parameter]);
  const now = new Date();
  const confirm = async () => {
    if (!reagentId) return setError('Select a reagent batch.');
    setBusy(true);
    setError(null);
    try {
      if (!reagentConsumed) await repos.reagents.consumeForTest(reagentId);
      patch({ reagentConsumed: true });
      touch();
      router.push('/test/timer');
    } catch (e) {
      setError(
        e instanceof ExpiredReagentError
          ? 'This reagent is expired and cannot be used.'
          : e instanceof InsufficientReagentError
            ? 'Not enough reagent left for a test.'
            : e instanceof Error
              ? e.message
              : String(e),
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <Screen
      title="Reagent preparation"
      back
      footer={
        <Button
          label={reagentConsumed ? 'Continue' : 'Reagent added — continue'}
          loading={busy}
          disabled={!reagentId}
          onPress={() => void confirm()}
          testID="reagent-continue"
        />
      }
    >
      <WizardProgress step="Reagent" />
      <AppText variant="title">{PARAMETERS[parameter].reagent}</AppText>
      {error ? <Banner tone="danger" message={error} testID="reagent-error" /> : null}
      <AppText variant="label" color="muted">
        SELECT BATCH
      </AppText>
      <Card>
        {list.loading ? (
          <LoadingState />
        ) : !list.data?.length ? (
          <View style={{ gap: 8 }}>
            <AppText color="muted">No reagent batches recorded for this parameter.</AppText>
            <Button compact variant="secondary" label="Add reagent" onPress={() => router.push(`/reagents/new?parameter=${parameter}`)} testID="reagent-add" />
          </View>
        ) : (
          list.data.map((r, i) => {
            const expired = isExpired(r, now);
            const empty = r.testsRemaining < 1;
            const selected = r.reagentId === reagentId;
            return (
              <View key={r.reagentId}>
                {i > 0 ? <Divider /> : null}
                <ListRow
                  testID={`reagent-${r.reagentId}`}
                  icon={selected ? 'radio-button-on' : 'radio-button-off'}
                  title={`${r.reagentName}${r.batchNumber ? ` · ${r.batchNumber}` : ''}`}
                  subtitle={`~${r.testsRemaining} tests · expires ${r.expiryDate.slice(0, 10)} (${daysUntilExpiry(r, now)} d)`}
                  right={
                    expired ? (
                      <StatusPill tone="danger" label="Expired" />
                    ) : empty ? (
                      <StatusPill tone="danger" label="Empty" />
                    ) : isLowStock(r) ? (
                      <StatusPill tone="warning" label="Low" />
                    ) : null
                  }
                  onPress={expired || empty || reagentConsumed ? undefined : () => patch({ reagentId: r.reagentId })}
                />
              </View>
            );
          })
        )}
      </Card>
      <AppText variant="label" color="muted">
        STEPS
      </AppText>
      <Card>
        {PREP_STEPS.map((s, i) => (
          <AppText key={s} style={{ paddingVertical: 4 }}>
            {i + 1}. {s}
          </AppText>
        ))}
      </Card>
    </Screen>
  );
}

/** Screen 14 — Reagent preparation (A2, A12: expired reagents blocked, stock decremented). */
export default function ReagentStep() {
  return <FlowGuard>{({ parameter }) => <ReagentBody parameter={parameter} />}</FlowGuard>;
}
