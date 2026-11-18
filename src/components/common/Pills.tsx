import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';
import type { IconName } from './Button';

export type Tone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

export function StatusPill({ tone, label, icon, testID }: { tone: Tone; label: string; icon?: IconName; testID?: string }) {
  const t = useTheme();
  const map = {
    success: [t.colors.successBg, t.colors.success],
    warning: [t.colors.warningBg, t.colors.warning],
    danger: [t.colors.dangerBg, t.colors.danger],
    info: [t.colors.infoBg, t.colors.info],
    neutral: [t.colors.surfaceStrong, t.colors.textMuted],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View testID={testID} style={[styles.pill, { backgroundColor: bg }]} accessibilityLabel={label}>
      {icon ? <Ionicons name={icon} size={13} color={fg} /> : <View style={[styles.dot, { backgroundColor: fg }]} />}
      <AppText variant="label" style={{ color: fg }}>
        {label}
      </AppText>
    </View>
  );
}

export function Chip({ label, selected, onPress, color, testID }: { label: string; selected: boolean; onPress: () => void; color?: string; testID?: string }) {
  const t = useTheme();
  const c = color ?? t.colors.primary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, { borderColor: selected ? c : t.colors.border, backgroundColor: selected ? c : t.colors.surface }]}
    >
      <AppText variant="label" style={{ color: selected ? t.colors.textOnPrimary : t.colors.text }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999, alignSelf: 'flex-start' },
  dot: { width: 7, height: 7, borderRadius: 4 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, minHeight: 36, justifyContent: 'center' },
});
