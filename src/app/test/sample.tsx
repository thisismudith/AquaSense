import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Chip } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { TextField } from '@/components/forms/TextField';
import { SOURCE_TYPES, type SourceType } from '@/config/parameters';
import { validateSampleForm } from '@/features/samples/validation';
import { WizardProgress } from '@/features/testing/WizardHeader';
import { useT } from '@/i18n/useT';
import { useAppStore, useServices } from '@/store/appStore';
import { useTestFlow } from '@/store/testFlowStore';

/** Screen 10 — Sample details (A11). Creates or updates the sample record. */
export default function SampleDetails() {
  const t = useT();
  const { repos } = useServices();
  const touch = useAppStore((s) => s.touchData);
  const { parameter, sampleId, patch } = useTestFlow();
  const [name, setName] = useState('');
  const [source, setSource] = useState<SourceType>('tap');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<{ name?: string; notes?: string }>({});
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (!sampleId) return;
    void repos.samples.getById(sampleId).then((s) => {
      if (!s) return;
      setName(s.sampleName);
      setSource(s.sourceType);
      setNotes(s.notes ?? '');
    });
  }, [repos, sampleId]);

  if (!parameter) {
    return (
      <Screen title="Sample" back>
        <Banner tone="warning" message="Choose a parameter first." />
        <Button label="Choose parameter" onPress={() => router.replace('/test/select')} />
      </Screen>
    );
  }

  const save = async () => {
    const e = validateSampleForm({ name, notes });
    setErrors(e);
    if (Object.keys(e).length) return;
    setSaving(true);
    setSaveError(null);
    try {
      const data = { sampleName: name.trim(), sourceType: source, notes: notes.trim() || null };
      if (sampleId) await repos.samples.update(sampleId, data);
      else {
        const s = await repos.samples.create({ ...data, photoPath: null, location: null });
        patch({ sampleId: s.sampleId });
      }
      touch();
      router.push('/test/photo');
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen title="Sample details" back footer={<Button label={t('common.continue')} onPress={() => void save()} loading={saving} testID="sample-continue" />}>
      <WizardProgress step="Sample" />
      {saveError ? <Banner tone="danger" message={saveError} /> : null}
      <TextField label="Sample name" value={name} onChangeText={setName} placeholder="e.g. Village well 3" error={errors.name} maxLength={140} testID="sample-name" />
      <AppText variant="label" color="muted">
        SOURCE TYPE
      </AppText>
      <View style={styles.chips}>
        {SOURCE_TYPES.map((s) => (
          <Chip key={s} label={t(`source.${s}`)} selected={source === s} onPress={() => setSource(s)} testID={`source-${s}`} />
        ))}
      </View>
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline error={errors.notes} testID="sample-notes" />
    </Screen>
  );
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
