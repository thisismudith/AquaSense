import { router } from 'expo-router';

import { Button } from '@/components/common/Button';
import { Screen } from '@/components/common/Screen';
import { LocationEditor } from '@/features/samples/LocationEditor';
import { FlowGuard } from '@/features/testing/FlowGuard';
import { WizardProgress } from '@/features/testing/WizardHeader';

/** Screen 12 — Location capture. */
export default function LocationStep() {
  return (
    <FlowGuard>
      {({ sampleId }) => (
        <Screen title="Location" back footer={<Button label="Continue" onPress={() => router.push('/test/safety')} testID="loc-continue" />}>
          <WizardProgress step="Location" />
          <LocationEditor sampleId={sampleId} />
        </Screen>
      )}
    </FlowGuard>
  );
}
