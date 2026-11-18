import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Card } from '@/components/common/Card';
import { Divider, ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { EmptyState, ErrorState, LoadingState } from '@/components/common/States';
import { TextField } from '@/components/forms/TextField';
import { useAsync } from '@/hooks/useAsync';
import { useT } from '@/i18n/useT';
import { useServices } from '@/store/appStore';
import { formatDate } from '@/utils/format';

/** Screen 27 — Sample records. */
export default function Samples() {
  const t = useT();
  const { repos } = useServices();
  const [q, setQ] = useState('');
  const data = useAsync(() => repos.samples.list({ search: q, limit: 1000 }), [repos, q]);
  return (
    <Screen title="Samples" testID="samples">
      <TextField label="Search" value={q} onChangeText={setQ} placeholder="Name or notes" testID="samples-search" />
      <Card>
        {data.loading && !data.data ? (
          <LoadingState />
        ) : data.error ? (
          <ErrorState message={data.error.message} onRetry={data.reload} />
        ) : !data.data?.length ? (
          <EmptyState icon="flask-outline" title={q ? 'No matching samples' : 'No samples yet'} message="Samples are created when you start a test." />
        ) : (
          data.data.map((s, i) => (
            <View key={s.sampleId}>
              {i > 0 ? <Divider /> : null}
              <ListRow
                testID={`sample-${s.sampleName}`}
                icon={s.photoPath ? 'image-outline' : 'flask-outline'}
                title={s.sampleName}
                subtitle={`${t(`source.${s.sourceType}`)} · ${formatDate(s.createdAt)}${s.location ? ' · geotagged' : ''}`}
                onPress={() => router.push(`/sample/${s.sampleId}`)}
              />
            </View>
          ))
        )}
      </Card>
    </Screen>
  );
}
