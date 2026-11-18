import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { useTheme } from '@/theme/ThemeProvider';

export const WIZARD_STEPS = ['Parameter', 'Sample', 'Photo', 'Location', 'Safety', 'Reagent', 'Timer', 'Measure'] as const;
export type WizardStep = (typeof WIZARD_STEPS)[number];

export function WizardProgress({ step }: { step: WizardStep }) {
  const t = useTheme();
  const idx = WIZARD_STEPS.indexOf(step);
  return (
    <View accessibilityLabel={`Step ${idx + 1} of ${WIZARD_STEPS.length}: ${step}`} style={styles.root}>
      <View style={styles.bars}>
        {WIZARD_STEPS.map((s, i) => (
          <View key={s} style={[styles.bar, { backgroundColor: i <= idx ? t.colors.primary : t.colors.border }]} />
        ))}
      </View>
      <AppText variant="label" color="muted">
        STEP {idx + 1} OF {WIZARD_STEPS.length} · {step.toUpperCase()}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 6 },
  bars: { flexDirection: 'row', gap: 4 },
  bar: { flex: 1, height: 4, borderRadius: 2 },
});
