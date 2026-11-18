import { router } from 'expo-router';
import { View } from 'react-native';

import { Card } from '@/components/common/Card';
import { Divider, ListRow } from '@/components/common/ListRow';
import { StatusPill } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { LoadingState } from '@/components/common/States';
import { PARAMETERS, PARAMETER_IDS } from '@/config/parameters';
import { useAsync } from '@/hooks/useAsync';
import { useServices } from '@/store/appStore';
import { formatNumber } from '@/utils/format';

/** Screen 36 — Calibration management (overview). */
export default function CalibrationList() {
  const { repos } = useServices();
  const data = useAsync(async () => Promise.all(PARAMETER_IDS.map(async (p) => ({ p, active: await repos.calibrations.getActive(p), n: (await repos.calibrations.list(p)).length }))), [repos]);
  if (data.loading && !data.data) return <LoadingState />;
  return (
    <Screen title="Calibration" back testID="cal-list">
      <Card>
        {data.data?.map(({ p, active, n }, i) => (
          <View key={p}>
            {i > 0 ? <Divider /> : null}
            <ListRow
              title={PARAMETERS[p].shortLabel}
              subtitle={active ? `v${active.calibrationVersion} · R² ${formatNumber(active.rSquared, 4)} · ${n} version${n === 1 ? '' : 's'}` : 'No calibration'}
              right={active ? <StatusPill tone={active.sentToDeviceAt ? 'success' : 'warning'} label={active.sentToDeviceAt ? 'On analyser' : 'Not sent'} /> : null}
              onPress={() => router.push(`/settings/calibration/${p}`)}
              testID={`cal-${p}`}
            />
          </View>
        ))}
      </Card>
    </Screen>
  );
}
