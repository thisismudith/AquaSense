import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Hero } from '@/components/common/Brand';
import { Button } from '@/components/common/Button';
import { Screen } from '@/components/common/Screen';
import { ErrorState, LoadingState } from '@/components/common/States';
import { QualityPill } from '@/components/domain';
import { PARAMETERS } from '@/config/parameters';
import { useAsync } from '@/hooks/useAsync';
import { useAppStore, useServices } from '@/store/appStore';
import { useTestFlow } from '@/store/testFlowStore';
import { formatConcentration } from '@/utils/format';

/** Screen 17 — Measurement completion. */
export default function Complete() {
  const { repos } = useServices();
  const units = useAppStore((s) => s.settings.units);
  const { resultId, reset } = useTestFlow();
  const result = useAsync(async () => (resultId ? repos.results.getById(resultId) : null), [repos, resultId]);
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }).start();
  }, [scale]);

  if (result.loading) return <LoadingState />;
  const r = result.data;
  if (!r) {
    return (
      <Screen title="Result">
        <ErrorState title="No result" message={result.error?.message ?? 'No measurement result is available.'} onRetry={() => router.replace('/(tabs)')} />
      </Screen>
    );
  }
  const open = () => {
    reset();
    router.replace(`/result/${r.resultId}`);
  };
  return (
    <Screen testID="complete" footer={<Button label="View full result" onPress={open} testID="complete-open" />}>
      <Hero>
        <View style={styles.center}>
          <Animated.View style={{ transform: [{ scale }] }}>
            <Ionicons name={r.measurementQualityStatus === 'ok' ? 'checkmark-circle' : 'alert-circle'} size={72} color="#FFFFFF" />
          </Animated.View>
          <AppText variant="h1" style={styles.light}>
            Measurement complete
          </AppText>
          <AppText style={styles.light}>{PARAMETERS[r.parameter].shortLabel}</AppText>
          <AppText variant="monoLarge" style={styles.light} testID="complete-value">
            {formatConcentration(r.finalReportedConcentration, units)}
          </AppText>
          <QualityPill quality={r.measurementQualityStatus} />
        </View>
      </Hero>
      <AppText color="muted" align="center">
        Saved on this phone · device test {r.deviceTestId}
      </AppText>
      <Button
        label="New test"
        variant="ghost"
        onPress={() => {
          reset();
          router.replace('/test/select');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ center: { alignItems: 'center', gap: 8, paddingVertical: 8 }, light: { color: '#FFFFFF' } });
