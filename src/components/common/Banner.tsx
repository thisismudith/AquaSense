import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';
import type { Tone } from './Pills';

const ICON = { success: 'checkmark-circle', warning: 'warning', danger: 'alert-circle', info: 'information-circle', neutral: 'information-circle-outline' } as const;

export function Banner({ tone, title, message, children, testID }: { tone: Tone; title?: string; message?: string; children?: ReactNode; testID?: string }) {
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
    <View testID={testID} accessibilityRole={tone === 'danger' || tone === 'warning' ? 'alert' : undefined} style={[styles.root, { backgroundColor: bg, borderColor: fg }]}>
      <Ionicons name={ICON[tone]} size={20} color={fg} />
      <View style={styles.body}>
        {title ? <AppText variant="bodyStrong">{title}</AppText> : null}
        {message ? <AppText variant="caption">{message}</AppText> : null}
        {children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexDirection: 'row', gap: 10, padding: 12, borderRadius: 14, borderLeftWidth: 4 },
  body: { flex: 1, gap: 4 },
});
