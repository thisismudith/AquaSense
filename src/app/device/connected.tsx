import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Hero } from '@/components/common/Brand';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { ErrorState } from '@/components/common/States';
import { selfTestSummary } from '@/features/device/selfTest';
import { useBle } from '@/hooks/useBle';

/** Screen 4 — Connection success. */
export default function Connected() {
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { snap } = useBle();
  const status = snap?.deviceStatus;
  if (!status || snap?.state !== 'connected') {
    return (
      <Screen title="Analyser" back>
        <ErrorState title="Not connected" message="The analyser is no longer connected." onRetry={() => router.replace('/device/pair')} />
      </Screen>
    );
  }
  const st = selfTestSummary(status.self_test);
  const sync = snap.lastSync;
  return (
    <Screen
      testID="connected"
      footer={
        <>
          <Button label="Run diagnostics" variant="secondary" icon="pulse" onPress={() => router.push('/device/diagnostics')} />
          <Button label={onboarding ? 'Go to home' : 'Done'} onPress={() => router.replace('/(tabs)')} testID="connected-done" />
        </>
      }
    >
      <Hero>
        <View style={styles.center}>
          <Ionicons name="checkmark-circle" size={64} color="#FFFFFF" />
          <AppText variant="h1" style={styles.light} align="center">
            Connected
          </AppText>
          <AppText style={styles.light} align="center">
            {status.name}
          </AppText>
        </View>
      </Hero>
      <Card>
        <ListRow icon="finger-print-outline" title="Device ID" value={status.device_id} />
        <ListRow icon="code-slash-outline" title="Firmware" value={status.firmware} />
        <ListRow icon="time-outline" title="Device clock" subtitle="Set from this phone on connection" />
        <ListRow
          icon="pulse-outline"
          title="Self-test"
          subtitle={Object.keys(status.self_test).length ? `${st.pass} passed · ${st.fail} failed · ${st.unknown} unknown` : 'Not reported by device'}
        />
        <ListRow icon="sync-outline" title="Stored results synced" value={sync ? `${sync.inserted} new` : '—'} />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', gap: 6, paddingVertical: 12 }, light: { color: '#FFFFFF' } });
