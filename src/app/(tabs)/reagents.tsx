import { router } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Divider, ListRow } from '@/components/common/ListRow';
import { StatusPill } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { PARAMETERS, PARAMETER_IDS } from '@/config/parameters';
import { daysUntilExpiry, isExpired, isLowStock } from '@/database/repositories/ReagentRepository';
import { EXPIRY_WARNING_DAYS } from '@/features/dashboard/alerts';
import { useAsync } from '@/hooks/useAsync';
import { useServices } from '@/store/appStore';

/** Screen 31 — Reagent inventory (A12). */
export default function Reagents() {
  const { repos } = useServices();
  const list = useAsync(() => repos.reagents.list(), [repos]);
  const now = new Date();
  return (
    <Screen
      title="Reagents"
      testID="reagents"
      right={<Button compact variant="ghost" label="Expiry" icon="calendar-outline" onPress={() => router.push('/reagents/expiry')} testID="rg-expiry" />}
      footer={<Button label="Add reagent" icon="add" onPress={() => router.push('/reagents/new')} testID="rg-add" />}
    >
      {list.loading && !list.data ? (
        <LoadingState />
      ) : list.error ? (
        <ErrorState message={list.error.message} onRetry={list.reload} />
      ) : !list.data?.length ? (
        <Card>
          <EmptyState icon="beaker-outline" title="No reagents recorded" message="Add reagent batches to track stock, tests remaining and expiry." />
        </Card>
      ) : (
        PARAMETER_IDS.filter((p) => list.data!.some((r) => r.parameter === p)).map((p) => (
          <View key={p} style={{ gap: 8 }}>
            <AppText variant="h2">{PARAMETERS[p].shortLabel}</AppText>
            <Card>
              {list.data!
                .filter((r) => r.parameter === p)
                .map((r, i) => {
                  const exp = isExpired(r, now);
                  const days = daysUntilExpiry(r, now);
                  return (
                    <View key={r.reagentId}>
                      {i > 0 ? <Divider /> : null}
                      <ListRow
                        testID={`rg-${r.reagentId}`}
                        icon="beaker-outline"
                        title={`${r.reagentName}${r.batchNumber ? ` · ${r.batchNumber}` : ''}`}
                        subtitle={`${r.quantityRemaining} ${r.quantityUnit} · ~${r.testsRemaining} tests · exp ${r.expiryDate.slice(0, 10)}`}
                        right={
                          exp ? (
                            <StatusPill tone="danger" label="Expired" />
                          ) : r.testsRemaining < 1 ? (
                            <StatusPill tone="danger" label="Empty" />
                          ) : isLowStock(r) ? (
                            <StatusPill tone="warning" label="Low" />
                          ) : days <= EXPIRY_WARNING_DAYS ? (
                            <StatusPill tone="warning" label={`${days} d`} />
                          ) : null
                        }
                        onPress={() => router.push(`/reagents/${r.reagentId}`)}
                      />
                    </View>
                  );
                })}
            </Card>
          </View>
        ))
      )}
    </Screen>
  );
}
