import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';
import { Button, type IconName } from './Button';

export function LoadingState({ label = 'Loading…' }: { label?: string }) {
  const t = useTheme();
  return (
    <View style={styles.center} accessibilityLiveRegion="polite" testID="loading-state">
      <ActivityIndicator color={t.colors.primary} size="large" />
      <AppText color="muted">{label}</AppText>
    </View>
  );
}

export function EmptyState({ icon = 'water-outline', title, message, action }: { icon?: IconName; title: string; message?: string; action?: { label: string; onPress: () => void } }) {
  const t = useTheme();
  return (
    <View style={styles.center} testID="empty-state">
      <View style={[styles.iconWrap, { backgroundColor: t.colors.surfaceStrong }]}>
        <Ionicons name={icon} size={30} color={t.colors.primary} />
      </View>
      <AppText variant="title" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText color="muted" align="center">
          {message}
        </AppText>
      ) : null}
      {action ? <Button label={action.label} onPress={action.onPress} variant="secondary" /> : null}
    </View>
  );
}

export function ErrorState({ title = 'Something went wrong', message, onRetry }: { title?: string; message?: string; onRetry?: () => void }) {
  const t = useTheme();
  return (
    <View style={styles.center} accessibilityRole="alert" testID="error-state">
      <View style={[styles.iconWrap, { backgroundColor: t.colors.dangerBg }]}>
        <Ionicons name="alert-circle-outline" size={30} color={t.colors.danger} />
      </View>
      <AppText variant="title" align="center">
        {title}
      </AppText>
      {message ? (
        <AppText color="muted" align="center">
          {message}
        </AppText>
      ) : null}
      {onRetry ? <Button label="Try again" onPress={onRetry} variant="secondary" icon="refresh" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', justifyContent: 'center', padding: 24, gap: 12, minHeight: 200 },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
});
