import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Card } from '@/components/common/Card';
import { StatusPill } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { ErrorState, LoadingState } from '@/components/common/States';
import { ParameterBadge } from '@/components/domain';
import { PARAMETERS, PARAMETER_IDS, type ParameterId } from '@/config/parameters';
import { WizardProgress } from '@/features/testing/WizardHeader';
import { useAsync } from '@/hooks/useAsync';
import { useBle } from '@/hooks/useBle';
import { useT } from '@/i18n/useT';
import { useServices } from '@/store/appStore';
import { useTestFlow } from '@/store/testFlowStore';

/** Screen 9 — Test selection. */
export default function SelectTest() {
  const t = useT();
  const { repos } = useServices();
  const { snap } = useBle();
  const start = useTestFlow((s) => s.start);
  const info = useAsync(async () => {
    const out: Record<ParameterId, { usable: number; calibrated: boolean }> = {} as never;
    for (const p of PARAMETER_IDS) {
      out[p] = { usable: (await repos.reagents.listUsable(p)).length, calibrated: !!(await repos.calibrations.getActive(p)) || !!snap?.deviceStatus?.calibrations[p] };
    }
    return out;
  }, [repos, snap?.deviceStatus]);

  const choose = (p: ParameterId) => {
    start(p);
    router.push('/test/sample');
  };

  return (
    <Screen title="New test" back testID="test-select">
      <WizardProgress step="Parameter" />
      {snap?.state !== 'connected' ? <Banner tone="info" message="The analyser is not connected. You can prepare the sample now and connect before measuring." /> : null}
      {info.loading ? (
        <LoadingState />
      ) : info.error ? (
        <ErrorState message={info.error.message} onRetry={info.reload} />
      ) : (
        PARAMETER_IDS.map((p) => {
          const cfg = PARAMETERS[p];
          const i = info.data?.[p];
          return (
            <Card key={p} onPress={() => choose(p)} testID={`param-${p}`} accessibilityLabel={t(cfg.labelKey as never)}>
              <View style={styles.row}>
                <ParameterBadge parameter={p} size={48} />
                <View style={styles.body}>
                  <AppText variant="title">{t(cfg.labelKey as never)}</AppText>
                  <AppText variant="caption" color="muted">
                    {cfg.reagent}
                  </AppText>
                  <AppText variant="caption">
                    {cfg.workingRange ? t('parameter.range', { min: cfg.workingRange.min, max: cfg.workingRange.max, unit: cfg.unit }) : t('parameter.rangePending')}
                    {cfg.reactionTime ? ` · ${cfg.reactionTime.minS / 60}–${cfg.reactionTime.maxS / 60} min` : ' · reaction time pending'}
                  </AppText>
                  <View style={styles.pills}>
                    <StatusPill tone={i?.usable ? 'success' : 'warning'} label={i?.usable ? `${i.usable} reagent batch${i.usable > 1 ? 'es' : ''}` : 'No usable reagent'} />
                    <StatusPill tone={i?.calibrated ? 'success' : 'warning'} label={i?.calibrated ? 'Calibrated' : 'No calibration'} />
                  </View>
                </View>
              </View>
            </Card>
          );
        })
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 14, alignItems: 'flex-start' },
  body: { flex: 1, gap: 4 },
  pills: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', marginTop: 4 },
});
