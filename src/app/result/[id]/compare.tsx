import { StyleSheet, View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Card } from '@/components/common/Card';
import { ListRow } from '@/components/common/ListRow';
import { Screen } from '@/components/common/Screen';
import { CameraPill } from '@/components/domain';
import { ResultGate } from '@/features/results/ResultGate';
import { parseCameraValidation } from '@/services/measurement/cameraValidation';
import { useAppStore } from '@/store/appStore';
import { formatConcentration, formatNumber } from '@/utils/format';

/** Screen 19 — Photometer / camera comparison. Camera validates only; no fusion (feature list D5). */
export default function Compare() {
  const units = useAppStore((s) => s.settings.units);
  return (
    <ResultGate title="Photometer vs camera">
      {({ result: r }) => {
        const cam = parseCameraValidation(r.cameraValidationStatus ? { status: r.cameraValidationStatus, rgb: r.cameraRgb } : null);
        const max = r.cameraRgb ? Math.max(255, r.cameraRgb.r, r.cameraRgb.g, r.cameraRgb.b) : 255;
        return (
          <Screen title="Photometer vs camera" back testID="compare">
            <Banner tone="info" message="The photometer concentration is the reported result. The camera (ESP32-B) only cross-checks the colour; its reading is never averaged in." />
            <View style={styles.row}>
              <Card style={styles.col}>
                <AppText variant="label" color="muted">
                  PHOTOMETER (REPORTED)
                </AppText>
                <AppText variant="h2">{formatConcentration(r.concentration, units)}</AppText>
                <AppText variant="caption" color="muted">
                  A = {formatNumber(r.absorbance)}
                </AppText>
              </Card>
              <Card style={styles.col}>
                <AppText variant="label" color="muted">
                  CAMERA CHECK
                </AppText>
                <CameraPill status={cam.status} raw={cam.rawStatus} />
                {r.cameraRgb ? (
                  <View style={[styles.swatch, { backgroundColor: `rgb(${Math.round((r.cameraRgb.r / max) * 255)},${Math.round((r.cameraRgb.g / max) * 255)},${Math.round((r.cameraRgb.b / max) * 255)})` }]} accessibilityLabel="Camera colour sample" testID="compare-swatch" />
                ) : (
                  <AppText variant="caption" color="muted">
                    No RGB values reported
                  </AppText>
                )}
              </Card>
            </View>
            <Card>
              <ListRow title="R" value={r.cameraRgb ? String(r.cameraRgb.r) : '—'} />
              <ListRow title="G" value={r.cameraRgb ? String(r.cameraRgb.g) : '—'} />
              <ListRow title="B" value={r.cameraRgb ? String(r.cameraRgb.b) : '—'} />
              <ListRow title="Device status text" value={cam.rawStatus ?? '—'} />
            </Card>
            {cam.status === 'disagree' ? <Banner tone="warning" title="Disagreement" message="The analyser's camera check disagreed with the photometer beyond its tolerance. A re-test is recommended." /> : null}
            <AppText variant="caption" color="muted">
              The cross-check algorithm and tolerance are defined in the analyser firmware.
            </AppText>
          </Screen>
        );
      }}
    </ResultGate>
  );
}

const styles = StyleSheet.create({ row: { flexDirection: 'row', gap: 12 }, col: { flex: 1, gap: 8 }, swatch: { height: 48, borderRadius: 10 } });
