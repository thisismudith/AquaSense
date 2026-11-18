import { View } from 'react-native';

import { AppText } from '@/components/common/AppText';
import { Banner } from '@/components/common/Banner';
import { Card } from '@/components/common/Card';
import { PARAMETERS, type ParameterId } from '@/config/parameters';
import { EXTRA_CARE, SAFETY } from '@/config/safety';

/** A9 — shows only verified guidance; otherwise points to the SDS and the lab procedure (no invented instructions). */
export function SafetyContentView({ parameter }: { parameter: ParameterId }) {
  const s = SAFETY[parameter];
  const cfg = PARAMETERS[parameter];
  return (
    <View style={{ gap: 12 }}>
      {EXTRA_CARE[parameter] ? <Banner tone="warning" title="Extra care" message={EXTRA_CARE[parameter]} /> : null}
      {s.verified ? (
        <>
          <Card>
            <AppText variant="title">Handling</AppText>
            {s.handling.map((h) => (
              <AppText key={h}>• {h}</AppText>
            ))}
          </Card>
          <Card>
            <AppText variant="title">Disposal</AppText>
            {s.disposal.map((h) => (
              <AppText key={h}>• {h}</AppText>
            ))}
          </Card>
          <AppText variant="caption" color="muted">
            Source: {s.source}
          </AppText>
        </>
      ) : (
        <Banner tone="info" title="Verified guidance not yet added" testID="safety-pending">
          <AppText variant="caption">
            Handling and disposal notes for {cfg.reagent} ({cfg.shortLabel}) have not been supplied by the lab yet. Follow the Safety Data Sheet (SDS) shipped
            with your reagent kit and your organisation&apos;s laboratory procedure.
          </AppText>
        </Banner>
      )}
    </View>
  );
}
