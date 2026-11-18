import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { Divider } from '@/components/common/ListRow';
import { Chip } from '@/components/common/Pills';
import { Screen } from '@/components/common/Screen';
import { ErrorState, LoadingState } from '@/components/common/States';
import { TextField } from '@/components/forms/TextField';
import { SOURCE_TYPES, type SourceType } from '@/config/parameters';
import { ResultRow } from '@/features/results/ResultRow';
import { LocationEditor } from '@/features/samples/LocationEditor';
import { PhotoEditor } from '@/features/samples/PhotoEditor';
import { validateSampleForm } from '@/features/samples/validation';
import { useAsync } from '@/hooks/useAsync';
import { useT } from '@/i18n/useT';
import { useAppStore, useServices } from '@/store/appStore';

/** Sample detail (A11): edit, photo, location, linked results, delete. Part of screen 27. */
export default function SampleDetail() {
  const t = useT();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { repos, photos } = useServices();
  const units = useAppStore((s) => s.settings.units);
  const touch = useAppStore((s) => s.touchData);
  const sample = useAsync(() => repos.samples.getById(id ?? ''), [repos, id]);
  const results = useAsync(() => repos.results.list({ sampleId: id ?? '' }), [repos, id]);
  const [name, setName] = useState('');
  const [notes, setNotes] = useState('');
  const [source, setSource] = useState<SourceType>('tap');
  const [errors, setErrors] = useState<{ name?: string; notes?: string }>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!sample.data) return;
    setName(sample.data.sampleName);
    setNotes(sample.data.notes ?? '');
    setSource(sample.data.sourceType);
  }, [sample.data]);

  if (sample.loading && !sample.data) return <LoadingState />;
  if (!sample.data)
    return (
      <Screen title="Sample" back>
        <ErrorState title="Sample not found" message={sample.error?.message} />
      </Screen>
    );

  const save = async () => {
    const e = validateSampleForm({ name, notes });
    setErrors(e);
    if (Object.keys(e).length) return;
    await repos.samples.update(sample.data!.sampleId, { sampleName: name.trim(), notes: notes.trim() || null, sourceType: source });
    touch();
    setMsg('Saved.');
  };

  const remove = () => {
    Alert.alert('Delete sample?', `Results stay in history but are no longer linked to "${sample.data!.sampleName}". The photo is deleted from this phone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () =>
          void photos.deleteSample(sample.data!.sampleId).then(() => {
            touch();
            router.back();
          }),
      },
    ]);
  };

  return (
    <Screen title="Sample" back testID="sample-detail">
      {msg ? <Banner tone="success" message={msg} /> : null}
      <TextField label="Sample name" value={name} onChangeText={setName} error={errors.name} testID="sd-name" />
      <View style={styles.chips}>
        {SOURCE_TYPES.map((s) => (
          <Chip key={s} label={t(`source.${s}`)} selected={source === s} onPress={() => setSource(s)} />
        ))}
      </View>
      <TextField label="Notes" value={notes} onChangeText={setNotes} multiline error={errors.notes} />
      <Button label="Save changes" onPress={() => void save()} testID="sd-save" />
      <AppText variant="h2">Photo</AppText>
      <PhotoEditor sampleId={sample.data.sampleId} />
      <AppText variant="h2">Location</AppText>
      <LocationEditor sampleId={sample.data.sampleId} />
      <AppText variant="h2">Results</AppText>
      <Card>
        {results.data?.length ? (
          results.data.map((r, i) => (
            <View key={r.resultId}>
              {i > 0 ? <Divider /> : null}
              <ResultRow r={r} sampleName={sample.data!.sampleName} units={units} />
            </View>
          ))
        ) : (
          <AppText color="muted">No results for this sample yet.</AppText>
        )}
      </Card>
      <Button label="Delete sample" variant="danger" icon="trash-outline" onPress={remove} testID="sd-delete" />
    </Screen>
  );
}

const styles = StyleSheet.create({ chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 } });
