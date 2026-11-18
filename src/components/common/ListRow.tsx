import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';
import type { IconName } from './Button';

export function ListRow({
  icon,
  title,
  subtitle,
  value,
  right,
  onPress,
  testID,
  destructive,
}: {
  icon?: IconName;
  title: string;
  subtitle?: string;
  value?: string;
  right?: ReactNode;
  onPress?: () => void;
  testID?: string;
  destructive?: boolean;
}) {
  const t = useTheme();
  const content = (
    <>
      {icon ? (
        <View style={[styles.icon, { backgroundColor: destructive ? t.colors.dangerBg : t.colors.surfaceStrong }]}>
          <Ionicons name={icon} size={18} color={destructive ? t.colors.danger : t.colors.primary} />
        </View>
      ) : null}
      <View style={styles.body}>
        <AppText variant="bodyStrong" color={destructive ? 'danger' : 'text'}>
          {title}
        </AppText>
        {subtitle ? (
          <AppText variant="caption" color="muted" numberOfLines={2}>
            {subtitle}
          </AppText>
        ) : null}
      </View>
      {value ? (
        <AppText variant="mono" color="muted">
          {value}
        </AppText>
      ) : null}
      {right}
      {onPress ? <Ionicons name="chevron-forward" size={18} color={t.colors.textMuted} /> : null}
    </>
  );
  if (!onPress) return <View style={styles.row} testID={testID}>{content}</View>;
  return (
    <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={title} onPress={onPress} style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}>
      {content}
    </Pressable>
  );
}

export function Divider() {
  const t = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: t.colors.border }} />;
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 12, minHeight: 52 },
  icon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  body: { flex: 1, gap: 2 },
});
