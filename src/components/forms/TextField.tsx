import { StyleSheet, TextInput, View, type TextInputProps } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { useTheme } from '@/theme/ThemeProvider';

export function TextField({ label, error, hint, style, ...rest }: TextInputProps & { label: string; error?: string | null; hint?: string }) {
  const t = useTheme();
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
          { color: t.colors.text, backgroundColor: t.colors.surface, borderColor: error ? t.colors.danger : t.colors.border, borderRadius: t.radii.md },
          rest.multiline && { minHeight: 88, textAlignVertical: 'top' },
          style,
        ]}
        {...rest}
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
  input: { borderWidth: 1, paddingHorizontal: 14, paddingVertical: 12, minHeight: 48 },
});
