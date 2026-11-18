import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Screen } from '@/components/common/Screen';
import { PARAMETERS, PARAMETER_IDS } from '@/config/parameters';
import { SafetyContentView } from '@/features/safety/SafetyContentView';

/** Screen 41 — Safety information (A9) for all reagents. */
export default function SafetyInfo() {
  return (
    <Screen title="Safety information" back testID="safety-info">
      {PARAMETER_IDS.map((p) => (
        <View key={p} style={{ gap: 8 }}>
          <AppText variant="h2">
            {PARAMETERS[p].shortLabel} · {PARAMETERS[p].reagent}
          </AppText>
          <SafetyContentView parameter={p} />
        </View>
      ))}
    </Screen>
  );
}
