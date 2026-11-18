import { Ionicons } from '@expo/vector-icons';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Button } from '@/components/common/Button';
import { StatusPill, type Tone } from '@/components/common/Pills';
import { PARAMETERS, type ParameterId } from '@/config/parameters';
import { useT } from '@/i18n/useT';
import type { ConnectionState } from '@/services/bluetooth/BLEManager';
import type { CameraStatus } from '@/services/measurement/cameraValidation';
import { openAppSettings, type PermissionKind, type PermissionOutcome } from '@/services/permissions/permissions';
import { useTheme } from '@/theme/ThemeProvider';
import type { MeasurementQuality } from '@/types/domain';

export function useParameterColor(p: ParameterId): string {
  const t = useTheme();
  return t.colors.tint[PARAMETERS[p].tint];
}

export function ParameterBadge({ parameter, size = 40 }: { parameter: ParameterId; size?: number }) {
  const color = useParameterColor(parameter);
  return (
    <View style={[styles.badge, { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}22`, borderColor: color }]} accessibilityElementsHidden>
      <AppText variant="label" numberOfLines={1} adjustsFontSizeToFit style={{ color, fontSize: PARAMETERS[parameter].shortLabel.length > 4 ? size / 4.4 : size / 3.4 }}>
        {PARAMETERS[parameter].shortLabel}
      </AppText>
    </View>
  );
}

export const QUALITY_TONE: Record<MeasurementQuality, Tone> = {
  ok: 'success',
  retest_required: 'warning',
  unstable: 'warning',
  over_range: 'warning',
  below_detection: 'info',
  invalid: 'danger',
};

export function QualityPill({ quality }: { quality: MeasurementQuality }) {
  const t = useT();
  return <StatusPill testID={`quality-${quality}`} tone={QUALITY_TONE[quality]} label={t(`quality.${quality}`)} />;
}

export function CameraPill({ status, raw }: { status: CameraStatus; raw: string | null }) {
  const t = useT();
  const tone: Tone = status === 'agree' ? 'success' : status === 'disagree' ? 'warning' : 'neutral';
  const label = status === 'unknown' ? t('camera.unknown', { raw: raw ?? '?' }) : t(`camera.${status}`);
  return <StatusPill tone={tone} label={label} icon="camera-outline" />;
}

const CONN_TONE: Record<ConnectionState, Tone> = {
  idle: 'neutral',
  scanning: 'info',
  connecting: 'info',
  connected: 'success',
  reconnecting: 'warning',
  disconnected: 'neutral',
};

export function ConnectionPill({ state, attempt }: { state: ConnectionState; attempt?: number }) {
  const t = useT();
  return <StatusPill testID="connection-pill" tone={CONN_TONE[state]} label={t(`ble.state.${state}`, { n: attempt ?? 1 })} icon="bluetooth" />;
}

/** Contextual permission explanation shown before / after the system prompt. */
export function PermissionNotice({ kind, outcome, onRequest }: { kind: PermissionKind; outcome: PermissionOutcome | null; onRequest: () => void }) {
  const t = useT();
  if (outcome === 'granted') return null;
  return (
    <Banner tone={outcome ? 'warning' : 'info'} title={t(`perm.${kind}.title`)} message={t(`perm.${kind}.why`)} testID={`perm-${kind}`}>
      {outcome ? <AppText variant="caption">{t(outcome === 'blocked' ? 'perm.blocked' : 'perm.denied')}</AppText> : null}
      <View style={styles.row}>
        {outcome === 'blocked' ? (
          <Button compact variant="secondary" label={t('common.openSettings')} icon="settings-outline" onPress={() => void openAppSettings()} />
        ) : (
          <Button compact variant="secondary" label={t('perm.allow')} onPress={onRequest} />
        )}
      </View>
    </Banner>
  );
}

export function MockBanner() {
  const t = useT();
  return (
    <View style={styles.mock} accessibilityRole="alert" testID="mock-banner">
      <Ionicons name="flask-outline" size={14} color="#6B3A00" />
      <AppText variant="label" style={{ color: '#6B3A00' }}>
        {t('common.mock')}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: { alignItems: 'center', justifyContent: 'center', borderWidth: 1.5 },
  row: { flexDirection: 'row', gap: 8, marginTop: 6 },
  mock: { flexDirection: 'row', gap: 6, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFD27A', paddingVertical: 4 },
});
