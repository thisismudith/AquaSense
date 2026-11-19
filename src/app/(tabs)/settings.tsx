import Constants from 'expo-constants';
import { router } from 'expo-router';
import { Switch, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Card } from '@/components/common/Card';
import { Divider, ListRow } from '@/components/common/ListRow';
import { Chip } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { BLE_PROTOCOL } from '@/config/ble';
import { LANGUAGES } from '@/i18n';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/theme/ThemeProvider';

/** Settings hub (A8): units, pairing, calibration, firmware, language, theme, notifications, backup, safety. */
export default function Settings() {
  const theme = useTheme();
  const settings = useAppStore((s) => s.settings);
  const update = useAppStore((s) => s.updateSetting);
  const go = (p: string) => () => router.push(p as never);
  return (
    <Screen title="Settings" testID="settings">
      <Card>
        <ListRow icon="hardware-chip-outline" title="Device management" subtitle="Pair, reconnect, sync options" onPress={go('/settings/devices')} testID="set-devices" />
        <Divider />
        <ListRow icon="trending-up-outline" title="Calibration" subtitle="Standards, curve fit, send to analyser" onPress={go('/settings/calibration')} testID="set-calibration" />
        <Divider />
        <ListRow icon="code-slash-outline" title="Firmware" onPress={go('/settings/firmware')} testID="set-firmware" />
      </Card>
      <Card>
        <AppText variant="label" color="muted">
          CONCENTRATION UNITS
        </AppText>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          {(['mg/L', 'µg/L'] as const).map((u) => (
            <Chip key={u} label={u} selected={settings.units === u} onPress={() => void update('units', u)} testID={`set-unit-${u}`} />
          ))}
        </View>
      </Card>
      <Card>
        <ListRow icon="language-outline" title="Language" value={LANGUAGES[settings.language].label} onPress={go('/settings/language')} testID="set-language" />
        <Divider />
        <ListRow icon="contrast-outline" title="Theme" value={settings.theme.charAt(0).toUpperCase() + settings.theme.slice(1)} onPress={go('/settings/theme')} testID="set-theme" />
        <Divider />
        <ListRow
          icon="notifications-outline"
          title="Timer alerts"
          subtitle="Notify when a reaction timer ends"
          right={
            <Switch
              accessibilityLabel="Timer alerts"
              value={settings.notificationPreferences.timerAlerts}
              onValueChange={(v) => void update('notificationPreferences', { ...settings.notificationPreferences, timerAlerts: v })}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              testID="set-alerts"
            />
          }
        />
        <ListRow
          icon="phone-portrait-outline"
          title="Vibration"
          right={
            <Switch
              accessibilityLabel="Vibration"
              value={settings.notificationPreferences.vibration}
              onValueChange={(v) => void update('notificationPreferences', { ...settings.notificationPreferences, vibration: v })}
              trackColor={{ true: theme.colors.primary, false: theme.colors.border }}
              testID="set-vibration"
            />
          }
        />
      </Card>
      <Card>
        <ListRow icon="save-outline" title="Backup & restore" onPress={go('/settings/backup')} testID="set-backup" />
        <Divider />
        <ListRow icon="document-text-outline" title="Reports" onPress={go('/reports')} />
        <Divider />
        <ListRow icon="shield-checkmark-outline" title="Safety information" onPress={go('/settings/safety')} testID="set-safety" />
      </Card>
      <AppText variant="caption" color="muted" align="center">
        AquaSense {Constants.expoConfig?.version ?? ''} · Offline · Data stays on this phone · BLE protocol v{BLE_PROTOCOL.protocolVersion} ({BLE_PROTOCOL.status})
      </AppText>
    </Screen>
  );
}
