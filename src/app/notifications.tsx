import { router } from 'expo-router';
import { Pressable } from 'react-native';

import { Banner } from '@/components/common/Banner';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { computeAlerts } from '@/features/dashboard/alerts';
import { useAsync } from '@/hooks/useAsync';
import { useBle } from '@/hooks/useBle';
import { useServices } from '@/store/appStore';

/** Screen 8 — Notifications (derived local alerts). */
export default function NotificationsScreen() {
  const { repos } = useServices();
  const { snap } = useBle();
  const alerts = useAsync(() => computeAlerts(repos, snap), [repos, snap]);
  return (
    <Screen title="Notifications" back testID="notifications" onRefresh={alerts.reload} refreshing={false}>
      {alerts.loading ? (
        <LoadingState />
      ) : alerts.error ? (
        <ErrorState message={alerts.error.message} onRetry={alerts.reload} />
      ) : !alerts.data?.length ? (
        <Card>
          <EmptyState icon="notifications-off-outline" title="All clear" message="No reagent, timer, calibration or device alerts." />
        </Card>
      ) : (
        alerts.data.map((a) => (
          <Pressable key={a.id} disabled={!a.route} onPress={() => a.route && router.push(a.route as never)} accessibilityRole={a.route ? 'button' : undefined} accessibilityLabel={a.title}>
            <Banner tone={a.tone} title={a.title} message={a.message} testID={`alert-${a.id}`} />
          </Pressable>
        ))
      )}
    </Screen>
  );
}
