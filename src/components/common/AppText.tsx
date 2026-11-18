import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';
import type { TypographyVariant } from '@/theme/tokens';

export interface AppTextProps extends TextProps {
  variant?: TypographyVariant;
  color?: 'text' | 'muted' | 'primary' | 'onPrimary' | 'danger' | 'warning' | 'success' | 'info';
  align?: TextStyle['textAlign'];
}

export function AppText({ variant = 'body', color = 'text', align, style, ...rest }: AppTextProps) {
  const t = useTheme();
  const c = {
    text: t.colors.text,
    muted: t.colors.textMuted,
    primary: t.colors.primary,
    onPrimary: t.colors.textOnPrimary,
    danger: t.colors.danger,
    warning: t.colors.warning,
    success: t.colors.success,
    info: t.colors.info,
  }[color];
  const isHeading = variant === 'display' || variant === 'h1' || variant === 'h2';
  return (
    <Text
      accessibilityRole={isHeading ? 'header' : undefined}
      maxFontSizeMultiplier={1.6}
      style={[t.typography[variant], { color: c, textAlign: align }, variant.startsWith('mono') && { fontVariant: ['tabular-nums'] }, style]}
      {...rest}
    />
  );
}
