import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { ParameterBadge, QualityPill } from '@/components/domain';
import { PARAMETERS } from '@/config/parameters';
import type { TestResult } from '@/types/domain';
import { formatConcentration, formatDateTime } from '@/utils/format';
import type { ConcentrationUnit } from '@/utils/format';

export function ResultRow({ r, sampleName, units }: { r: TestResult; sampleName: string | null; units: ConcentrationUnit }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${PARAMETERS[r.parameter].shortLabel} ${sampleName ?? ''} ${formatConcentration(r.finalReportedConcentration, units)}`}
      onPress={() => router.push(`/result/${r.resultId}`)}
      style={({ pressed }) => [styles.row, { opacity: pressed ? 0.7 : 1 }]}
      testID={`row-${r.deviceTestId}`}
    >
      <ParameterBadge parameter={r.parameter} />
      <View style={styles.body}>
        <AppText variant="bodyStrong" numberOfLines={1}>
          {sampleName ?? 'Unlinked sample'}
        </AppText>
        <AppText variant="caption" color="muted">
          {formatDateTime(r.deviceTimestamp ?? r.createdAt)} · {r.deviceTestId}
        </AppText>
      </View>
      <View style={styles.right}>
        <AppText variant="mono">{formatConcentration(r.finalReportedConcentration, units)}</AppText>
        <QualityPill quality={r.measurementQualityStatus} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
  body: { flex: 1, gap: 2 },
  right: { alignItems: 'flex-end', gap: 4 },
});
