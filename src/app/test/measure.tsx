import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import { ConnectionPill } from '@/components/domain';
import { PARAMETERS, type ParameterId } from '@/config/parameters';
import { FlowGuard } from '@/features/testing/FlowGuard';
import { WizardProgress } from '@/features/testing/WizardHeader';
import { bleErrorMessage, useBle } from '@/hooks/useBle';
import { BleError } from '@/services/bluetooth/BLETypes';
import { useAppStore } from '@/store/appStore';
import { useTestFlow } from '@/store/testFlowStore';
import { useTheme } from '@/theme/ThemeProvider';

const STAGE_LABEL: Record<string, string> = {
  requested: 'Starting measurement…',
  dark: 'Reading dark level (LED off)…',
  blank: 'Reading blank…',
  sample: 'Reading sample (525 nm)…',
  camera: 'Camera cross-check…',
};

function MeasureBody({ parameter, sampleId }: { parameter: ParameterId; sampleId: string }) {
  const theme = useTheme();
  const { manager, snap } = useBle();
  const touch = useAppStore((s) => s.touchData);
  const patch = useTestFlow((s) => s.patch);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<BleError | Error | null>(null);
  const connected = snap?.state === 'connected';
  const pending = snap?.pendingMeasurement;
  const hasDeviceCal = !!snap?.deviceStatus?.calibrations[parameter];

  // Result recovered by sync after a disconnect during measurement.
  useEffect(() => {
    if (!manager) return;
    return manager.onResult((r, source) => {
      if (source === 'sync' && r.parameter === parameter && r.sampleId === sampleId) {
        patch({ resultId: r.resultId });
        touch();
        router.replace('/test/complete');
      }
    });
  }, [manager, parameter, sampleId, patch, touch]);

  const measure = async () => {
    if (!manager) return;
    setRunning(true);
    setError(null);
    try {
      const r = await manager.measure(parameter, sampleId);
      patch({ resultId: r.resultId });
      touch();
      router.replace('/test/complete');
    } catch (e) {
      setError(e instanceof Error ? e : new Error(String(e)));
    } finally {
      setRunning(false);
    }
  };

  const lostDuringMeasurement = error instanceof BleError && error.code === 'disconnected' && !!pending;

  return (
    <Screen
      title="Measurement"
      back
      footer={
        connected ? (
          <Button label={running ? 'Measuring…' : 'Start measurement'} icon="flash-outline" loading={running} disabled={!!pending && !running} onPress={() => void measure()} testID="measure-start" />
        ) : (
          <Button label="Connect analyser" icon="bluetooth" onPress={() => router.push('/device/pair')} testID="measure-connect" />
        )
      }
    >
      <WizardProgress step="Measure" />
      <ConnectionPill state={snap?.state ?? 'idle'} attempt={snap?.reconnectAttempt} />
      {connected && !hasDeviceCal ? (
        <Banner tone="warning" title="No calibration on analyser" message={`The analyser has no ${PARAMETERS[parameter].shortLabel} calibration. It will report raw readings without a concentration.`} testID="measure-nocal" />
      ) : null}
      {lostDuringMeasurement ? (
        <Banner tone="warning" title="Connection lost during measurement" message="The analyser finishes the measurement and stores it. Reconnect and the result will be retrieved automatically." testID="measure-lost" />
      ) : error ? (
        <Banner tone="danger" message={bleErrorMessage(error)} testID="measure-error" />
      ) : null}
      <Card style={styles.card}>
        {running || (pending && snap?.measurementStage) ? (
          <View style={styles.center}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <AppText variant="title" testID="measure-stage">
              {STAGE_LABEL[snap?.measurementStage ?? 'requested'] ?? snap?.measurementStage}
            </AppText>
            <AppText color="muted" align="center">
              Keep the lid closed and the analyser still.
            </AppText>
          </View>
        ) : (
          <AppText color="muted" align="center">
            Insert the reacted cuvette, close the lid, then start the measurement. The analyser measures dark, blank and sample intensities and cross-checks
            the colour with its camera.
          </AppText>
        )}
      </Card>
    </Screen>
  );
}

/** Screen 16 — Live measurement. */
export default function MeasureStep() {
  return <FlowGuard>{(ctx) => <MeasureBody {...ctx} />}</FlowGuard>;
}

const styles = StyleSheet.create({ card: { minHeight: 200, justifyContent: 'center' }, center: { alignItems: 'center', gap: 12 } });
