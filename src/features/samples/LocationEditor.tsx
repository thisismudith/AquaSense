import { useState } from 'react';
import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { Card } from '@/components/common/Card';
import { PermissionNotice } from '@/components/domain';
import { useAsync } from '@/hooks/useAsync';
import { captureLocation, formatCoordinates, type LocationOutcome } from '@/services/location/LocationService';
import { useAppStore, useServices } from '@/store/appStore';
import { formatDateTime } from '@/utils/format';

const MESSAGES: Record<Exclude<LocationOutcome, { ok: true }>['reason'], string> = {
  denied: 'Location permission was not granted.',
  blocked: 'Location permission is turned off.',
  services_disabled: 'Location services are turned off on this phone. Turn on location and try again.',
  timeout: 'Could not get a location fix in time. Move to open sky and try again.',
  unavailable: 'Location is unavailable right now.',
};

/** A5 geotag: coordinates as text (no map view in v1). Screen 12. */
export function LocationEditor({ sampleId }: { sampleId: string }) {
  const { repos } = useServices();
  const touch = useAppStore((s) => s.touchData);
  const sample = useAsync(() => repos.samples.getById(sampleId), [repos, sampleId]);
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<Exclude<LocationOutcome, { ok: true }> | null>(null);

  const capture = async () => {
    setBusy(true);
    setFailure(null);
    try {
      const r = await captureLocation();
      if (!r.ok) setFailure(r);
      else {
        await repos.samples.update(sampleId, { location: r.location });
        touch();
        sample.reload();
      }
    } finally {
      setBusy(false);
    }
  };

  const clear = async () => {
    await repos.samples.update(sampleId, { location: null });
    touch();
    sample.reload();
  };

  const loc = sample.data?.location;
  return (
    <View style={{ gap: 12 }}>
      {failure && (failure.reason === 'denied' || failure.reason === 'blocked') ? (
        <PermissionNotice kind="location" outcome={failure.reason} onRequest={() => void capture()} />
      ) : failure ? (
        <Banner tone="warning" message={MESSAGES[failure.reason]} testID="loc-error" />
      ) : (
        <Banner tone="neutral" title="Optional" message="Location is used only to tag this sample. It never leaves this phone unless you export a report." />
      )}
      <Card>
        {loc ? (
          <View style={{ gap: 4 }} testID="loc-value">
            <AppText variant="mono">{formatCoordinates(loc)}</AppText>
            <AppText variant="caption" color="muted">
              Accuracy ±{loc.accuracy !== null ? `${Math.round(loc.accuracy)} m` : 'unknown'} · {formatDateTime(loc.timestamp)}
            </AppText>
          </View>
        ) : (
          <AppText color="muted">No location saved.</AppText>
        )}
      </Card>
      <Button label={loc ? 'Update location' : 'Capture location'} icon="locate-outline" variant="secondary" loading={busy} onPress={() => void capture()} testID="loc-capture" />
      {loc ? <Button label="Remove location" variant="ghost" icon="trash-outline" onPress={() => void clear()} testID="loc-remove" /> : null}
    </View>
  );
}
