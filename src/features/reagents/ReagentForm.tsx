import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Button } from '@/components/common/Button';
import { Chip } from '@/components/common/Pills';
import { TextField } from '@/components/forms/TextField';
import { PARAMETERS, PARAMETER_IDS, type ParameterId } from '@/config/parameters';
import type { NewReagent, Reagent } from '@/types/domain';

export interface ReagentFormValues {
  parameter: ParameterId;
  reagentName: string;
  quantityRemaining: string;
  quantityUnit: string;
  quantityPerTest: string;
  lowStockThreshold: string;
  expiryDate: string;
  batchNumber: string;
}

export type ReagentFormErrors = Partial<Record<keyof ReagentFormValues, string>>;

const num = (s: string) => Number(s.trim().replace(',', '.'));

/** Validates and converts the reagent form. Expiry must be a real calendar date (YYYY-MM-DD). */
export function parseReagentForm(v: ReagentFormValues): { ok: true; value: NewReagent } | { ok: false; errors: ReagentFormErrors } {
  const e: ReagentFormErrors = {};
  if (!v.reagentName.trim()) e.reagentName = 'Enter the reagent name';
  const q = num(v.quantityRemaining);
  if (!v.quantityRemaining.trim() || !Number.isFinite(q) || q < 0) e.quantityRemaining = 'Enter a quantity of 0 or more';
  const per = num(v.quantityPerTest);
  if (!Number.isFinite(per) || per <= 0) e.quantityPerTest = 'Enter the amount used per test (> 0)';
  const low = num(v.lowStockThreshold);
  if (!Number.isInteger(low) || low < 0) e.lowStockThreshold = 'Enter a whole number of tests';
  if (!v.quantityUnit.trim()) e.quantityUnit = 'Enter a unit';
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v.expiryDate.trim());
  const d = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!m || !d || d.getUTCMonth() !== Number(m[2]) - 1 || d.getUTCDate() !== Number(m[3])) e.expiryDate = 'Use YYYY-MM-DD';
  if (Object.keys(e).length) return { ok: false, errors: e };
  return {
    ok: true,
    value: {
      parameter: v.parameter,
      reagentName: v.reagentName.trim(),
      quantityRemaining: q,
      quantityUnit: v.quantityUnit.trim(),
      quantityPerTest: per,
      lowStockThreshold: low,
      expiryDate: v.expiryDate.trim(),
      batchNumber: v.batchNumber.trim() || null,
    },
  };
}

export function toFormValues(r: Reagent | null, parameter: ParameterId = 'cr6'): ReagentFormValues {
  return {
    parameter: r?.parameter ?? parameter,
    reagentName: r?.reagentName ?? PARAMETERS[parameter].reagent,
    quantityRemaining: r ? String(r.quantityRemaining) : '',
    quantityUnit: r?.quantityUnit ?? 'mL',
    quantityPerTest: r ? String(r.quantityPerTest) : '1',
    lowStockThreshold: r ? String(r.lowStockThreshold) : '5',
    expiryDate: r?.expiryDate.slice(0, 10) ?? '',
    batchNumber: r?.batchNumber ?? '',
  };
}

export function ReagentForm({ initial, submitLabel, onSubmit }: { initial: ReagentFormValues; submitLabel: string; onSubmit: (v: NewReagent) => Promise<void> }) {
  const [v, setV] = useState(initial);
  const [errors, setErrors] = useState<ReagentFormErrors>({});
  const [busy, setBusy] = useState(false);
  const set = (k: keyof ReagentFormValues) => (s: string) => setV({ ...v, [k]: s });

  const submit = async () => {
    const r = parseReagentForm(v);
    if (!r.ok) return setErrors(r.errors);
    setErrors({});
    setBusy(true);
    try {
      await onSubmit(r.value);
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <AppText variant="label" color="muted">
        PARAMETER
      </AppText>
      <View style={styles.chips}>
        {PARAMETER_IDS.map((p) => (
          <Chip key={p} label={PARAMETERS[p].shortLabel} selected={v.parameter === p} onPress={() => setV({ ...v, parameter: p })} testID={`rf-param-${p}`} />
        ))}
      </View>
      <TextField label="Reagent name" value={v.reagentName} onChangeText={set('reagentName')} error={errors.reagentName} testID="rf-name" />
      <TextField label="Batch / lot number" value={v.batchNumber} onChangeText={set('batchNumber')} testID="rf-batch" />
      <View style={styles.row}>
        <View style={styles.flex}>
          <TextField label="Quantity remaining" keyboardType="decimal-pad" value={v.quantityRemaining} onChangeText={set('quantityRemaining')} error={errors.quantityRemaining} testID="rf-qty" />
        </View>
        <View style={{ width: 96 }}>
          <TextField label="Unit" value={v.quantityUnit} onChangeText={set('quantityUnit')} error={errors.quantityUnit} testID="rf-unit" />
        </View>
      </View>
      <TextField label="Used per test" keyboardType="decimal-pad" value={v.quantityPerTest} onChangeText={set('quantityPerTest')} error={errors.quantityPerTest} hint="From your kit instructions" testID="rf-per" />
      <TextField label="Low-stock warning at (tests)" keyboardType="number-pad" value={v.lowStockThreshold} onChangeText={set('lowStockThreshold')} error={errors.lowStockThreshold} testID="rf-low" />
      <TextField label="Expiry date" placeholder="YYYY-MM-DD" value={v.expiryDate} onChangeText={set('expiryDate')} error={errors.expiryDate} testID="rf-expiry" />
      <Button label={submitLabel} loading={busy} onPress={() => void submit()} testID="rf-submit" />
    </View>
  );
}

const styles = StyleSheet.create({ root: { gap: 14 }, chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 }, row: { flexDirection: 'row', gap: 10 }, flex: { flex: 1 } });
