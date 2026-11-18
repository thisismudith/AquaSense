import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { PermissionNotice } from '@/components/domain';
import { useAsync } from '@/hooks/useAsync';
import { pickFromGallery, takePhoto, type PickOutcome } from '@/services/camera/photoPicker';
import type { PermissionOutcome } from '@/services/permissions/permissions';
import { useAppStore, useServices } from '@/store/appStore';
import { useTheme } from '@/theme/ThemeProvider';

/** Camera / gallery capture, preview, replace and remove for a sample photo (A11, screen 11). */
export function PhotoEditor({ sampleId }: { sampleId: string }) {
  const theme = useTheme();
  const { repos, photos } = useServices();
  const touch = useAppStore((s) => s.touchData);
  const [busy, setBusy] = useState<'camera' | 'gallery' | 'remove' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [camPerm, setCamPerm] = useState<PermissionOutcome | null>(null);
  const sample = useAsync(() => repos.samples.getById(sampleId), [repos, sampleId]);
  const status = useAsync(() => photos.status(sample.data?.photoPath ?? null), [photos, sample.data?.photoPath]);

  const handle = async (kind: 'camera' | 'gallery') => {
    setBusy(kind);
    setError(null);
    try {
      const r: PickOutcome = kind === 'camera' ? await takePhoto() : await pickFromGallery();
      if (r.kind === 'permission') setCamPerm(r.outcome);
      else if (r.kind === 'error') setError(r.message);
      else if (r.kind === 'picked') {
        setCamPerm('granted');
        await photos.setSamplePhoto(sampleId, r.uri);
        touch();
        sample.reload();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy('remove');
    try {
      await photos.removeSamplePhoto(sampleId);
      touch();
      sample.reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const st = status.data;
  return (
    <View style={styles.root}>
      {camPerm && camPerm !== 'granted' ? <PermissionNotice kind="camera" outcome={camPerm} onRequest={() => void handle('camera')} /> : null}
      {error ? <Banner tone="danger" message={error} /> : null}
      <Card style={styles.preview}>
        {st?.kind === 'ok' ? (
          <Image source={{ uri: st.uri }} style={[styles.image, { borderRadius: theme.radii.md }]} resizeMode="cover" accessibilityLabel="Sample photo" testID="photo-preview" />
        ) : st?.kind === 'missing' ? (
          <Banner tone="warning" title="Photo file missing" message="The photo file could not be found on this phone. Take or choose a new one, or remove it." testID="photo-missing" />
        ) : (
          <AppText color="muted" align="center" testID="photo-none">
            No photo yet. Photos are optional and stay on this phone.
          </AppText>
        )}
      </Card>
      <View style={styles.row}>
        <Button style={styles.flex} label={st?.kind === 'none' || !st ? 'Take photo' : 'Retake'} icon="camera-outline" variant="secondary" loading={busy === 'camera'} onPress={() => void handle('camera')} testID="photo-camera" />
        <Button style={styles.flex} label="Gallery" icon="images-outline" variant="secondary" loading={busy === 'gallery'} onPress={() => void handle('gallery')} testID="photo-gallery" />
      </View>
      {st && st.kind !== 'none' ? <Button label="Remove photo" icon="trash-outline" variant="ghost" loading={busy === 'remove'} onPress={() => void remove()} testID="photo-remove" /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { gap: 12 },
  preview: { minHeight: 180, justifyContent: 'center' },
  image: { width: '100%', aspectRatio: 4 / 3 },
  row: { flexDirection: 'row', gap: 10 },
  flex: { flex: 1 },
});
