import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { useTheme } from '@/theme/ThemeProvider';

/**
 * Keeps only what can form a number: digits, one decimal point (a typed comma becomes '.') and, when allowed,
 * a leading minus. Integer fields drop the decimal point. Stops letters arriving by paste or hardware keyboard.
 */
export function sanitizeNumber(s: string, { integer = false, negative = false }: { integer?: boolean; negative?: boolean } = {}): string {
  const minus = negative && s.trimStart().startsWith('-') ? '-' : '';
  let body = s.replace(/,/g, '.').replace(integer ? /[^0-9]/g : /[^0-9.]/g, '');
  const dot = body.indexOf('.');
  if (dot >= 0) body = body.slice(0, dot + 1) + body.slice(dot + 1).replace(/\./g, '');
  return minus + body;
}

export function TextField({
  label,
  error,
  hint,
  style,
  allowNegative,
  onChangeText,
  ...rest
}: TextInputProps & {
  label: string;
  error?: string | null;
  hint?: string;
  /** Numeric fields only: permit a leading minus. */ allowNegative?: boolean;
}) {
  const t = useTheme();
  const numeric = rest.keyboardType === 'decimal-pad' || rest.keyboardType === 'number-pad' || rest.keyboardType === 'numeric';
  const integer = rest.keyboardType === 'number-pad';
  const change = numeric && onChangeText ? (v: string) => onChangeText(sanitizeNumber(v, { integer, negative: allowNegative })) : onChangeText;
  return (
    <View style={styles.root}>
      <AppText variant="label" color="muted">
        {label.toUpperCase()}
      </AppText>
      <TextInput
        accessibilityLabel={label}
        placeholderTextColor={t.colors.textMuted}
        style={[
          t.typography.body,
          styles.input,
          {
            color: t.colors.text,
            backgroundColor: t.colors.surface,
            borderColor: error ? t.colors.danger : t.colors.border,
            borderRadius: t.radii.md,
          },
          rest.multiline && { minHeight: 88, textAlignVertical: 'top' },
          style,
        ]}
        {...rest}
        onChangeText={change}
      />
      {error ? (
        <AppText variant="caption" color="danger" accessibilityRole="alert">
          {error}
        </AppText>
      ) : hint ? (
        <AppText variant="caption" color="muted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  input: {
    borderWidth: 1,
    paddingHorizontal: 14,
    paddingVertical: 12,
    minHeight: 48,
  },
});
