import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Screen } from '@/components/common/Screen';
import type { ParameterId } from '@/config/parameters';
import { useTestFlow } from '@/store/testFlowStore';

/** Renders children only when the wizard has the state this step needs (e.g. after an app restart). */
export function FlowGuard({ needSample = true, children }: { needSample?: boolean; children: (ctx: { parameter: ParameterId; sampleId: string }) => ReactNode }) {
  const { parameter, sampleId } = useTestFlow();
  if (!parameter || (needSample && !sampleId)) {
    return (
      <Screen title="New test" back>
        <Banner tone="warning" title="Test not started" message="This step needs a parameter and sample. Start the guided test from the beginning." />
        <Button label="Start a new test" onPress={() => router.replace('/test/select')} testID="flow-restart" />
      </Screen>
    );
  }
  return <>{children({ parameter, sampleId: sampleId ?? '' })}</>;
}
