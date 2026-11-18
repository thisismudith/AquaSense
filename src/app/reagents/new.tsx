import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';

import { Banner } from '@/components/common/Banner';
import { Screen } from '@/components/common/Screen';
import { isParameterId } from '@/config/parameters';
import { ReagentForm, toFormValues } from '@/features/reagents/ReagentForm';
import { useAppStore, useServices } from '@/store/appStore';

/** Add reagent batch (A12). */
export default function NewReagent() {
  const { parameter } = useLocalSearchParams<{ parameter?: string }>();
  const { repos } = useServices();
  const touch = useAppStore((s) => s.touchData);
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen title="Add reagent" back testID="reagent-new">
      {error ? <Banner tone="danger" message={error} /> : null}
      <ReagentForm
        initial={toFormValues(null, isParameterId(parameter) ? parameter : 'cr6')}
        submitLabel="Save reagent"
        onSubmit={async (v) => {
          try {
            await repos.reagents.create(v);
            touch();
            router.back();
          } catch (e) {
            setError(e instanceof Error ? e.message : String(e));
          }
        }}
      />
    </Screen>
  );
}
