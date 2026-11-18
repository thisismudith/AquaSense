import { router } from 'expo-router';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Screen } from '@/components/common/Screen';
import { ResultGate } from '@/features/results/ResultGate';
import { translate, type TranslationKey } from '@/i18n';
import { useTestFlow } from '@/store/testFlowStore';

/** Screen 23 — Re-test workflow: same sample & parameter, back through safety → reagent → timer → measure. */
export default function Retest() {
  const flow = useTestFlow();
  return (
    <ResultGate title="Re-test">
      {({ result: r, sample }) => {
        const reasons = [
          ...(r.retestRequired ? ['The analyser flagged this measurement for re-test.'] : []),
          ...r.deviceWarnings.map((w) => {
            const s = translate(`warning.${w}` as TranslationKey);
            return s === `warning.${w}` ? w : s;
          }),
          ...(r.cameraValidationStatus === 'disagree' ? ['Camera cross-check disagreed with the photometer.'] : []),
        ];
        const start = () => {
          flow.start(r.parameter);
          flow.patch({ sampleId: r.sampleId });
          router.push(r.sampleId ? '/test/safety' : '/test/sample');
        };
        return (
          <Screen title="Re-test" back testID="retest" footer={<Button label={sample ? `Re-test ${sample.sampleName}` : 'Re-test (new sample record)'} icon="refresh" onPress={start} testID="retest-start" />}>
            <Card>
              <AppText variant="title">Why re-test</AppText>
              {reasons.length ? reasons.map((x) => <AppText key={x}>• {x}</AppText>) : <AppText color="muted">No issues were reported. You can still repeat the measurement.</AppText>}
            </Card>
            <Card>
              <AppText variant="title">Before you start</AppText>
              <AppText>• Use a fresh aliquot of the same sample and a clean, dry cuvette.</AppText>
              <AppText>• Check the lid is closed and the sample has no bubbles or turbidity.</AppText>
              <AppText>• If the reading was over range, dilute first (see Dilution).</AppText>
            </Card>
            <Banner tone="info" message="The original result is kept. The re-test is saved as a new result linked to the same sample." />
          </Screen>
        );
      }}
    </ResultGate>
  );
}
