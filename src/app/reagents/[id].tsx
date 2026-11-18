import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Chip } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { ErrorState, LoadingState } from '@/components/common/States';
import { TextField } from '@/components/forms/TextField';
import { PARAMETERS } from '@/config/parameters';
import { daysUntilExpiry, isExpired, isLowStock } from '@/database/repositories/ReagentRepository';
import { ReagentForm, toFormValues } from '@/features/reagents/ReagentForm';
import { useAsync } from '@/hooks/useAsync';
import { useAppStore, useServices } from '@/store/appStore';

/** Screens 32 (reagent details) & 33 (stock updates). */
export default function ReagentDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repos } = useServices();
  const touch = useAppStore((s) => s.touchData);
  const r = useAsync(() => repos.reagents.getById(id ?? ''), [repos, id]);
  const [mode, setMode] = useState<'view' | 'edit'>('view');
  const [delta, setDelta] = useState('');
  const [dir, setDir] = useState<'add' | 'remove'>('add');
  const [msg, setMsg] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null);

  if (r.loading && !r.data) return <LoadingState />;
  if (!r.data)
    return (
      <Screen title="Reagent" back>
        <ErrorState title="Reagent not found" message={r.error?.message} />
      </Screen>
    );
  const g = r.data;
  const now = new Date();
  const expired = isExpired(g, now);

  const applyStock = async () => {
    const n = Number(delta.replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0) return setMsg({ tone: 'danger', text: 'Enter an amount greater than 0.' });
    try {
      await repos.reagents.adjustStock(g.reagentId, dir === 'add' ? n : -n);
      touch();
      r.reload();
      setDelta('');
      setMsg({ tone: 'success', text: `Stock ${dir === 'add' ? 'added' : 'removed'}: ${n} ${g.quantityUnit}.` });
    } catch (e) {
      setMsg({ tone: 'danger', text: e instanceof RangeError ? 'Stock cannot go below zero.' : e instanceof Error ? e.message : String(e) });
    }
  };

  const remove = () =>
    Alert.alert('Delete reagent batch?', 'This removes the batch from your inventory.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => void repos.reagents.delete(g.reagentId).then(() => (touch(), router.back())) },
    ]);

  if (mode === 'edit')
    return (
      <Screen title="Edit reagent" back={() => setMode('view')}>
        <ReagentForm
          initial={toFormValues(g)}
          submitLabel="Save changes"
          onSubmit={async (v) => {
            await repos.reagents.update(g.reagentId, v);
            touch();
            r.reload();
            setMode('view');
          }}
        />
      </Screen>
    );

  return (
    <Screen title={g.reagentName} back testID="reagent-detail" right={<Button compact variant="ghost" label="Edit" onPress={() => setMode('edit')} testID="rd-edit" />}>
      {expired ? <Banner tone="danger" title="Expired" message="This batch is blocked from use in tests." testID="rd-expired" /> : null}
      {!expired && isLowStock(g) ? <Banner tone="warning" title="Low stock" message={`About ${g.testsRemaining} tests left.`} /> : null}
      {msg ? <Banner tone={msg.tone} message={msg.text} testID="rd-msg" /> : null}
      <Card>
        <ListRow title="Parameter" value={PARAMETERS[g.parameter].shortLabel} />
        <ListRow title="Batch" value={g.batchNumber ?? '—'} />
        <ListRow title="Remaining" value={`${g.quantityRemaining} ${g.quantityUnit}`} testID="rd-qty" />
        <ListRow title="Estimated tests left" value={String(g.testsRemaining)} testID="rd-tests" />
        <ListRow title="Used per test" value={`${g.quantityPerTest} ${g.quantityUnit}`} />
        <ListRow title="Expiry" value={`${g.expiryDate.slice(0, 10)} (${daysUntilExpiry(g, now)} d)`} />
      </Card>
      <AppText variant="h2">Update stock</AppText>
      <View style={styles.row}>
        <Chip label="Add / restock" selected={dir === 'add'} onPress={() => setDir('add')} testID="rd-add" />
        <Chip label="Remove / correct" selected={dir === 'remove'} onPress={() => setDir('remove')} testID="rd-remove" />
      </View>
      <TextField label={`Amount (${g.quantityUnit})`} keyboardType="decimal-pad" value={delta} onChangeText={setDelta} testID="rd-delta" />
      <Button label="Apply" variant="secondary" onPress={() => void applyStock()} testID="rd-apply" />
      <Button label="Delete batch" variant="ghost" icon="trash-outline" onPress={remove} />
    </Screen>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 8 } });
