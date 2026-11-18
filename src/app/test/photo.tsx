import { router } from 'expo-router';

import { Button } from '@/components/common/Button';
import { Screen } from '@/components/common/Screen';
import { PhotoEditor } from '@/features/samples/PhotoEditor';
import { FlowGuard } from '@/features/testing/FlowGuard';
import { WizardProgress } from '@/features/testing/WizardHeader';

/** Screen 11 — Camera / gallery selection. */
export default function PhotoStep() {
  return (
    <FlowGuard>
      {({ sampleId }) => (
        <Screen title="Sample photo" back footer={<Button label="Continue" onPress={() => router.push('/test/location')} testID="photo-continue" />}>
          <WizardProgress step="Photo" />
          <PhotoEditor sampleId={sampleId} />
        </Screen>
      )}
    </FlowGuard>
  );
}
