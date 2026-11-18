import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { DropletLogo, Hero } from '@/components/common/Brand';
import { Button, type IconName } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Divider } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { ConnectionPill, ParameterBadge, QualityPill } from '@/components/domain';
import { PARAMETERS } from '@/config/parameters';
import { computeAlerts } from '@/features/dashboard/alerts';
import { useAsync } from '@/hooks/useAsync';
import { useBle } from '@/hooks/useBle';
import { useAppStore, useServices } from '@/store/appStore';
import { useTheme } from '@/theme/ThemeProvider';
import { formatConcentration, relativeTime } from '@/utils/format';

const TILES: { icon: IconName; label: string; route: string }[] = [
  { icon: 'time-outline', label: 'History', route: '/(tabs)/history' },
  { icon: 'analytics-outline', label: 'Analytics', route: '/analytics' },
  { icon: 'document-text-outline', label: 'Reports', route: '/reports' },
  { icon: 'beaker-outline', label: 'Reagents', route: '/(tabs)/reagents' },
];

/** Screen 6 — Home dashboard. */
export default function Home() {
  const theme = useTheme();
  const { repos } = useServices();
  const { snap } = useBle();
  const units = useAppStore((s) => s.settings.units);
  const recent = useAsync(() => repos.results.list({ limit: 5 }), [repos]);
  const alerts = useAsync(() => computeAlerts(repos, snap), [repos, snap?.lastSync, snap?.pendingMeasurement, snap?.deviceStatus]);
  const samples = useAsync(async () => new Map((await repos.samples.list({ limit: 1000 })).map((s) => [s.sampleId, s.sampleName])), [repos]);
  const status = snap?.deviceStatus;
  const alertCount = alerts.data?.length ?? 0;

  return (
    <Screen testID="home" onRefresh={() => (recent.reload(), alerts.reload())} refreshing={false}>
      <View style={styles.top}>
        <View style={styles.brand}>
          <DropletLogo size={34} />
          <AppText variant="h2">AquaSense</AppText>
        </View>
        <Pressable accessibilityRole="button" accessibilityLabel={`Notifications, ${alertCount} alerts`} onPress={() => router.push('/notifications')} hitSlop={10} testID="home-bell">
          <Ionicons name="notifications-outline" size={26} color={theme.colors.primary} />
          {alertCount ? (
            <View style={[styles.badge, { backgroundColor: theme.colors.danger }]}>
              <AppText variant="label" style={styles.light}>
                {alertCount}
              </AppText>
            </View>
          ) : null}
        </Pressable>
      </View>

      <Hero>
        <View style={styles.heroRow}>
          <View style={{ flex: 1, gap: 6 }}>
            <AppText variant="label" style={styles.lightMuted}>
              ANALYSER
            </AppText>
            <AppText variant="h2" style={styles.light} numberOfLines={1}>
              {status?.name ?? 'No analyser connected'}
            </AppText>
            <ConnectionPill state={snap?.state ?? 'idle'} attempt={snap?.reconnectAttempt} />
          </View>
          <Pressable accessibilityRole="button" accessibilityLabel="Device status" onPress={() => router.push(status ? '/device/status' : '/device/pair')} style={[styles.circle, { backgroundColor: 'rgba(255,255,255,0.18)' }]}>
            <Ionicons name={status ? 'hardware-chip-outline' : 'bluetooth'} size={26} color="#FFFFFF" />
          </Pressable>
        </View>
        <Button label="Start a new test" icon="add-circle-outline" variant="secondary" onPress={() => router.push('/test/select')} testID="home-start" />
      </Hero>

      <View style={styles.tiles}>
        {TILES.map((tile) => (
          <Card key={tile.label} style={styles.tile} onPress={() => router.push(tile.route as never)} accessibilityLabel={tile.label}>
            <Ionicons name={tile.icon} size={24} color={theme.colors.primary} />
            <AppText variant="bodyStrong">{tile.label}</AppText>
          </Card>
        ))}
      </View>

      <AppText variant="h2">Recent tests</AppText>
      <Card>
        {recent.loading ? (
          <LoadingState />
        ) : recent.error ? (
          <ErrorState message={recent.error.message} onRetry={recent.reload} />
        ) : !recent.data?.length ? (
          <EmptyState title="No tests yet" message="Your results will appear here." action={{ label: 'Start a test', onPress: () => router.push('/test/select') }} />
        ) : (
          recent.data.map((r, i) => (
            <View key={r.resultId}>
              {i > 0 ? <Divider /> : null}
              <Pressable accessibilityRole="button" accessibilityLabel={`${PARAMETERS[r.parameter].shortLabel} result`} onPress={() => router.push(`/result/${r.resultId}`)} style={styles.recent}>
                <ParameterBadge parameter={r.parameter} />
                <View style={{ flex: 1, gap: 2 }}>
                  <AppText variant="bodyStrong" numberOfLines={1}>
                    {(r.sampleId && samples.data?.get(r.sampleId)) || 'Unlinked sample'}
                  </AppText>
                  <AppText variant="caption" color="muted">
                    {relativeTime(r.createdAt)}
                  </AppText>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <AppText variant="mono">{formatConcentration(r.finalReportedConcentration, units)}</AppText>
                  <QualityPill quality={r.measurementQualityStatus} />
                </View>
              </Pressable>
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  badge: { position: 'absolute', right: -6, top: -4, minWidth: 18, height: 18, borderRadius: 9, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 4 },
  light: { color: '#FFFFFF' },
  lightMuted: { color: 'rgba(255,255,255,0.7)' },
  heroRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  circle: { width: 56, height: 56, borderRadius: 28, alignItems: 'center', justifyContent: 'center' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  tile: { flexBasis: '47%', flexGrow: 1, gap: 8, padding: 16 },
  recent: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
});
