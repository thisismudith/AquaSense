import type { ReactNode } from 'react';

import { Screen } from '@/components/common/Screen';
import { ErrorState, LoadingState } from '@/components/common/States';

import { useResultBundle, type ResultBundle } from './useResult';

/** Common loading / not-found / error handling for result sub-screens. */
export function ResultGate({ title, children }: { title: string; children: (b: ResultBundle & { reload: () => void }) => ReactNode }) {
  const { data, loading, error, reload } = useResultBundle();
  if (loading)
    return (
      <Screen title={title} back>
        <LoadingState />
      </Screen>
    );
  if (error)
    return (
      <Screen title={title} back>
        <ErrorState message={error.message} onRetry={reload} />
      </Screen>
    );
  if (!data)
    return (
      <Screen title={title} back>
        <ErrorState title="Result not found" message="This result no longer exists on this phone." />
      </Screen>
    );
  return <>{children({ ...data, reload })}</>;
}
