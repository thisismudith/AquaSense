import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Chip } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { TextField } from '@/components/forms/TextField';
import { PARAMETERS } from '@/config/parameters';
import { ResultGate } from '@/features/results/ResultGate';
import type { ResultBundle } from '@/features/results/useResult';
import { correctForDilution, dilutionFactorFromVolumes, suggestDilution, validateDilutionFactor } from '@/services/measurement/photometry';
import { useAppStore, useServices } from '@/store/appStore';
import { formatConcentration } from '@/utils/format';

const ERR: Record<string, string> = {
  non_finite: 'Enter numbers only.',
  non_positive_volume: 'Volumes must be greater than zero.',
  sample_exceeds_total: 'Sample volume cannot exceed the total volume.',
  factor_below_one: 'Dilution factor must be 1 or more.',
};

function DilutionBody({ result: r, reload }: ResultBundle & { reload: () => void }) {
  const { repos } = useServices();
  const units = useAppStore((s) => s.settings.units);
  const touch = useAppStore((s) => s.touchData);
  const [mode, setMode] = useState<'factor' | 'volumes'>('factor');
  const [factor, setFactor] = useState(String(r.dilutionFactor));
  const [sampleVol, setSampleVol] = useState('');
  const [totalVol, setTotalVol] = useState('');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);
  const range = PARAMETERS[r.parameter].workingRange;
  const suggestion = suggestDilution(r.concentration, range?.max ?? null);

  const computed = mode === 'factor' ? validateDilutionFactor(Number(factor.replace(',', '.'))) : dilutionFactorFromVolumes(Number(sampleVol.replace(',', '.')), Number(totalVol.replace(',', '.')));
  const preview = computed.ok ? correctForDilution(r.concentration, computed.value) : null;

  const save = async () => {
    if (!computed.ok) return;
    try {
      await repos.results.setDilution(r.resultId, computed.value);
      touch();
      reload();
      setMsg({ tone: 'success', text: `Saved dilution ×${computed.value}. The original device reading is unchanged.` });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof Error ? e.message : String(e) });
    }
  };

  return (
    <Screen title="Dilution" back testID="dilution" footer={<Button label="Save dilution factor" disabled={!computed.ok} onPress={() => void save()} testID="dilution-save" />}>
      {msg ? <Banner tone={msg.tone} message={msg.text} testID="dilution-msg" /> : null}
      {suggestion ? <Banner tone="warning" title="Over range" message={`Suggested: dilute ${suggestion}× (1 part sample + ${suggestion - 1} parts distilled water), then measure again.`} testID="dilution-suggest" /> : null}
      <Card>
        <AppText variant="title">Guidance</AppText>
        <AppText>1. Measure the sample volume with a pipette or syringe.</AppText>
        <AppText>2. Make up to the total volume with distilled/deionised water and mix.</AppText>
        <AppText>3. Measure the diluted sample. Enter the dilution here so the original-sample concentration is reported.</AppText>
        <AppText variant="mono" color="muted">
          factor = total volume ÷ sample volume
        </AppText>
      </Card>
      <View style={styles.row}>
        <Chip label="Enter factor" selected={mode === 'factor'} onPress={() => setMode('factor')} testID="mode-factor" />
        <Chip label="From volumes" selected={mode === 'volumes'} onPress={() => setMode('volumes')} testID="mode-volumes" />
      </View>
      {mode === 'factor' ? (
        <TextField label="Dilution factor" keyboardType="decimal-pad" value={factor} onChangeText={setFactor} error={!computed.ok ? ERR[computed.error] : null} testID="dilution-factor" />
      ) : (
        <>
          <TextField label="Sample volume (mL)" keyboardType="decimal-pad" value={sampleVol} onChangeText={setSampleVol} testID="dilution-sample" />
          <TextField label="Total volume (mL)" keyboardType="decimal-pad" value={totalVol} onChangeText={setTotalVol} error={!computed.ok && (sampleVol || totalVol) ? ERR[computed.error] : null} testID="dilution-total" />
        </>
      )}
      <Card>
        <ListRow title="Device reading (unchanged)" value={formatConcentration(r.concentration, units)} />
        <ListRow title="Factor" value={computed.ok ? `×${Number(computed.value.toFixed(4))}` : '—'} />
        <ListRow title="Original sample concentration" value={preview?.ok ? formatConcentration(preview.value, units) : '—'} testID="dilution-preview" />
      </Card>
    </Screen>
  );
}

/** Screen 22 — Dilution guidance (A13). */
export default function Dilution() {
  return <ResultGate title="Dilution">{(b) => <DilutionBody {...b} />}</ResultGate>;
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 } });
