import { Redirect } from 'expo-router';
import { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { AppText } from '@/components/common/AppText';
import { DropletLogo, Ripples } from '@/components/common/Brand';
import { Button } from '@/components/common/Button';
import { useT } from '@/i18n/useT';
import { bootApp } from '@/services/boot';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/theme/ThemeProvider';

/** Screen 1 — Splash. Shows while the local database boots, then routes to onboarding or home. */
export default function Splash() {
  const t = useT();
  const theme = useTheme();
  const status = useAppStore((s) => s.status);
  const bootError = useAppStore((s) => s.bootError);
  const onboarded = useAppStore((s) => s.settings.onboardingComplete);
  const pulse = useRef(new Animated.Value(0.9)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1.05, duration: 900, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0.9, duration: 900, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [pulse]);

  if (status === 'ready') return <Redirect href={onboarded ? '/(tabs)' : '/welcome'} />;

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.heroFrom }]} testID="splash">
      <View style={styles.ripples} pointerEvents="none">
        <Ripples size={520} opacity={0.1} />
      </View>
      <Animated.View style={{ transform: [{ scale: pulse }] }}>
        <DropletLogo size={96} />
      </Animated.View>
      <AppText variant="display" style={styles.light}>
        {t('app.name')}
      </AppText>
      <AppText style={styles.muted}>{t('app.tagline')}</AppText>
      {status === 'error' ? (
        <View style={styles.error} accessibilityRole="alert">
          <AppText style={styles.light} align="center">
            Could not open the local database: {bootError}
          </AppText>
          <Button label={t('common.retry')} variant="secondary" onPress={() => void bootApp()} />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, padding: 24 },
  ripples: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  light: { color: '#FFFFFF' },
  muted: { color: 'rgba(255,255,255,0.75)' },
  error: { marginTop: 24, gap: 12, alignItems: 'center' },
});
