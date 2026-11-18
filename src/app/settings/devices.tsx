import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Switch, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Divider, ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { EmptyState } from '@/components/common/States';
import { ConnectionPill } from '@/components/domain';
import { useAsync } from '@/hooks/useAsync';
import { useBle } from '@/hooks/useBle';
import { useAppStore, useServices } from '@/store/appStore';
import { useTheme } from '@/theme/ThemeProvider';
import { relativeTime } from '@/utils/format';

/** Screen 35 — Device management. */
export default function Devices() {
  const theme = useTheme();
  const { repos } = useServices();
  const { snap } = useBle();
  const prefs = useAppStore((s) => s.settings.devicePreferences);
  const update = useAppStore((s) => s.updateSetting);
  const devices = useAsync(() => repos.devices.list(), [repos, snap?.deviceStatus?.device_id]);
  const [msg, setMsg] = useState<string | null>(null);
  const connectedId = snap?.state === 'connected' ? snap.deviceStatus?.device_id : null;

  const forget = (id: string) =>
    Alert.alert('Forget analyser?', 'Removes this analyser from the list. Analysers with stored results cannot be removed (results keep their device reference).', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Forget',
        style: 'destructive',
        onPress: () =>
          void repos.devices
            .delete(id)
            .then(() => devices.reload())
            .catch(() => setMsg('This analyser has results stored on this phone and cannot be removed.')),
      },
    ]);

  return (
    <Screen title="Devices" back testID="devices" footer={<Button label="Pair an analyser" icon="bluetooth" onPress={() => router.push('/device/pair')} testID="dev-pair" />}>
      <ConnectionPill state={snap?.state ?? 'idle'} attempt={snap?.reconnectAttempt} />
      {msg ? <Banner tone="warning" message={msg} testID="dev-msg" /> : null}
      <Card>
        {devices.data?.length ? (
          devices.data.map((d, i) => (
            <View key={d.deviceId}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                icon={d.deviceId === connectedId ? 'bluetooth' : 'hardware-chip-outline'}
                title={d.deviceName}
                subtitle={`${d.deviceId} · fw ${d.firmwareVersion ?? '?'} · last seen ${relativeTime(d.lastConnected)}`}
                onPress={() => (d.deviceId === connectedId ? router.push('/device/status') : forget(d.deviceId))}
                testID={`dev-${d.deviceId}`}
              />
            </View>
          ))
        ) : (
          <EmptyState icon="hardware-chip-outline" title="No analysers paired" />
        )}
      </Card>
      <Card>
        <ListRow
          title="Auto-reconnect"
          subtitle="Reconnect after the link drops"
          right={<Switch value={prefs.autoReconnect} onValueChange={(v) => void update('devicePreferences', { ...prefs, autoReconnect: v })} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} testID="dev-autoreconnect" />}
        />
        <ListRow
          title="Sync on connect"
          subtitle="Retrieve results stored on the analyser"
          right={<Switch value={prefs.autoSync} onValueChange={(v) => void update('devicePreferences', { ...prefs, autoSync: v })} trackColor={{ true: theme.colors.primary, false: theme.colors.border }} testID="dev-autosync" />}
        />
      </Card>
      <AppText variant="caption" color="muted">
        Tap the connected analyser for status; tap another to forget it.
      </AppText>
    </Screen>
  );
}
