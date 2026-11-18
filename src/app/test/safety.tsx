import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Screen } from '@/components/common/Screen';
import { SafetyContentView } from '@/features/safety/SafetyContentView';
import { FlowGuard } from '@/features/testing/FlowGuard';
import { WizardProgress } from '@/features/testing/WizardHeader';
import { useTestFlow } from '@/store/testFlowStore';
import { useTheme } from '@/theme/ThemeProvider';

/** Screen 13 — Safety instructions (acknowledgement required). */
export default function SafetyStep() {
  const theme = useTheme();
  const ack = useTestFlow((s) => s.safetyAcknowledged);
  const patch = useTestFlow((s) => s.patch);
  return (
    <FlowGuard>
      {({ parameter }) => (
        <Screen title="Safety" back footer={<Button label="Continue" disabled={!ack} onPress={() => router.push('/test/reagent')} testID="safety-continue" />}>
          <WizardProgress step="Safety" />
          <SafetyContentView parameter={parameter} />
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: ack }}
            onPress={() => patch({ safetyAcknowledged: !ack })}
            style={styles.row}
            testID="safety-ack"
          >
            <Ionicons name={ack ? 'checkbox' : 'square-outline'} size={24} color={theme.colors.primary} />
            <AppText style={{ flex: 1 }}>I have read the reagent safety information and am wearing the protection it requires.</AppText>
          </Pressable>
        </Screen>
      )}
    </FlowGuard>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 10, alignItems: 'center', paddingVertical: 8 } });
