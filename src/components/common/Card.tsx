import type { ReactNode } from 'react';
import { Pressable, View, type StyleProp, type ViewStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

export function Card({
  children,
  style,
  glass,
  onPress,
  testID,
  accessibilityLabel,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  glass?: boolean;
  onPress?: () => void;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const t = useTheme();
  const base: ViewStyle = {
    backgroundColor: glass ? t.colors.surfaceGlass : t.colors.surface,
    borderRadius: t.radii.lg,
    padding: t.spacing.lg,
    borderWidth: 1,
    borderColor: glass ? 'rgba(255,255,255,0.35)' : t.colors.border,
    ...t.shadow.card,
  };
  if (onPress) {
    return (
      <Pressable testID={testID} accessibilityRole="button" accessibilityLabel={accessibilityLabel} onPress={onPress} style={({ pressed }) => [base, { opacity: pressed ? 0.9 : 1 }, style]}>
        {children}
      </Pressable>
    );
  }
  return (
    <View testID={testID} style={[base, style]}>
      {children}
    </View>
  );
}
