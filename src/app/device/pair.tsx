import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Divider, ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorState } from '@/components/common/States';
import { ConnectionPill, PermissionNotice } from '@/components/domain';
import { BLE_PROTOCOL } from '@/config/ble';
import { bleErrorMessage, useBle } from '@/hooks/useBle';
import { useT } from '@/i18n/useT';
import { useTheme } from '@/theme/ThemeProvider';

/** Screen 3 — Device pairing. Bluetooth permission is requested here, when the user starts searching. */
export default function PairDevice() {
  const t = useT();
  const theme = useTheme();
  const { onboarding } = useLocalSearchParams<{ onboarding?: string }>();
  const { manager, snap, available } = useBle();
  const [connecting, setConnecting] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => () => void manager?.stopScan().catch(() => undefined), [manager]);

  if (!available || !manager) {
    return (
      <Screen title="Pair analyser" back>
        <ErrorState title="Bluetooth unavailable" message={t('ble.err.native_unavailable')} />
      </Screen>
    );
  }

  const scanning = snap?.state === 'scanning';
  const permError = snap?.lastError?.code === 'permission_denied' ? snap.lastError : null;

  const search = async () => {
    setError(null);
    try {
      await manager.startScan();
    } catch (e) {
      setError(bleErrorMessage(e));
    }
  };

  const connect = async (id: string) => {
    setConnecting(id);
    setError(null);
    try {
      await manager.connect(id);
      router.replace(`/device/connected${onboarding ? '?onboarding=1' : ''}`);
    } catch (e) {
      setError(bleErrorMessage(e));
    } finally {
      setConnecting(null);
    }
  };

  return (
    <Screen
      title="Pair analyser"
      back
      footer={
        onboarding ? <Button label="Skip for now" variant="ghost" onPress={() => router.replace('/(tabs)')} testID="pair-skip" /> : undefined
      }
    >
      <ConnectionPill state={snap?.state ?? 'idle'} attempt={snap?.reconnectAttempt} />
      <AppText color="muted">Switch on the analyser (ESP32-A main controller) and keep it within a few metres. The camera board connects through it — only one device is paired.</AppText>
      {BLE_PROTOCOL.status === 'provisional' ? <Banner tone="info" message={t('ble.protocolProvisional')} /> : null}
      {permError ? (
        <PermissionNotice kind="bluetooth" outcome={permError.message.includes('permanently') ? 'blocked' : 'denied'} onRequest={() => void search()} />
      ) : (
        <Banner tone="neutral" title={t('perm.bluetooth.title')} message={t('perm.bluetooth.why')} />
      )}
      {error && !permError ? <Banner tone="danger" message={error} testID="pair-error" /> : null}
      <Button
        label={scanning ? 'Searching…' : 'Search for analyser'}
        icon="search"
        loading={scanning}
        onPress={() => void search()}
        testID="pair-search"
      />
      {scanning ? <Button label="Stop" variant="ghost" onPress={() => void manager.stopScan()} /> : null}
      <Card>
        {snap?.scanResults.length ? (
          snap.scanResults.map((d, i) => (
            <View key={d.id}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                testID={`device-${d.id}`}
                icon="hardware-chip-outline"
                title={d.name ?? 'Unnamed device'}
                subtitle={`${d.id} · signal ${d.rssi ?? '?'} dBm`}
                onPress={connecting ? undefined : () => void connect(d.id)}
                right={connecting === d.id ? <ActivityIndicator color={theme.colors.primary} /> : null}
              />
            </View>
          ))
        ) : (
          <EmptyState icon="bluetooth-outline" title={scanning ? 'Looking for analysers…' : 'No analyser found yet'} message="Only AquaSense analysers are listed." />
        )}
      </Card>
    </Screen>
  );
}
