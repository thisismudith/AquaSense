import { router } from 'expo-router';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import { Divider, ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { EmptyState, LoadingState } from '@/components/common/States';
import { PARAMETERS } from '@/config/parameters';
import { daysUntilExpiry } from '@/database/repositories/ReagentRepository';
import { EXPIRY_WARNING_DAYS } from '@/features/dashboard/alerts';
import { groupByExpiry } from '@/features/reagents/expiry';
import { useAsync } from '@/hooks/useAsync';
import { useServices } from '@/store/appStore';
import type { Reagent } from '@/types/domain';

/** Screen 34 — Expiry management. */
export default function Expiry() {
  const { repos } = useServices();
  const list = useAsync(() => repos.reagents.list(), [repos]);
  if (list.loading && !list.data) return <LoadingState />;
  const g = groupByExpiry(list.data ?? []);
  const section = (title: string, items: Reagent[], testID: string) => (
    <View style={{ gap: 8 }} testID={testID}>
      <AppText variant="h2">
        {title} ({items.length})
      </AppText>
      <Card>
        {items.length ? (
          items.map((r, i) => (
            <View key={r.reagentId}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                title={`${r.reagentName} (${PARAMETERS[r.parameter].shortLabel})`}
                subtitle={`${r.batchNumber ?? 'no batch'} · ${r.expiryDate.slice(0, 10)} · ${daysUntilExpiry(r)} d`}
                onPress={() => router.push(`/reagents/${r.reagentId}`)}
              />
            </View>
          ))
        ) : (
          <AppText color="muted">None</AppText>
        )}
      </Card>
    </View>
  );
  return (
    <Screen title="Expiry" back testID="expiry">
      {!list.data?.length ? (
        <EmptyState icon="calendar-outline" title="No reagents recorded" />
      ) : (
        <>
          {section('Expired — blocked', g.expired, 'exp-expired')}
          {section(`Expiring within ${EXPIRY_WARNING_DAYS} days`, g.soon, 'exp-soon')}
          {section('In date', g.ok, 'exp-ok')}
        </>
      )}
    </Screen>
  );
}
