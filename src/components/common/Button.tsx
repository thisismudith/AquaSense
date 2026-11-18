import { Ionicons } from '@expo/vector-icons';
import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

export type IconName = ComponentProps<typeof Ionicons>['name'];

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  icon?: IconName;
  loading?: boolean;
  disabled?: boolean;
  compact?: boolean;
  /** Rendered on a dark/teal surface (hero, welcome): ghost text turns white. */
  onDark?: boolean;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityHint?: string;
}

export function Button({ label, onPress, variant = 'primary', icon, loading, disabled, compact, onDark, style, testID, accessibilityHint }: ButtonProps) {
  const t = useTheme();
  const inactive = disabled || loading;
  const bg = { primary: t.colors.primary, secondary: t.colors.surfaceStrong, ghost: 'transparent', danger: t.colors.danger }[variant];
  const fg = variant === 'primary' || variant === 'danger' ? t.colors.textOnPrimary : onDark && variant === 'ghost' ? '#FFFFFF' : t.colors.primary;
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: !!inactive, busy: !!loading }}
      disabled={inactive}
      onPress={onPress}
      style={({ pressed }) => [
        styles.base,
        { backgroundColor: bg, borderRadius: t.radii.pill, paddingVertical: compact ? 8 : 14, opacity: inactive ? 0.5 : pressed ? 0.85 : 1 },
        variant === 'ghost' && { borderWidth: 1, borderColor: onDark ? 'rgba(255,255,255,0.5)' : t.colors.border },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={fg} size="small" /> : icon ? <Ionicons name={icon} size={18} color={fg} /> : null}
        <AppText variant="bodyStrong" style={{ color: fg }}>
          {label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { paddingHorizontal: 20, minHeight: 44, justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 },
});
