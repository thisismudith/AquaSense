import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';

import { AppText } from '@/components/common/AppText';
import { DropletLogo, Ripples } from '@/components/common/Brand';
import { Button, type IconName } from '@/components/common/Button';
import { useAppStore } from '@/store/appStore';
import { useTheme } from '@/theme/ThemeProvider';

const PAGES: { icon: IconName; title: string; body: string }[] = [
  { icon: 'water-outline', title: 'Lab-grade tests in the field', body: 'Measure hexavalent chromium, nitrite, free chlorine and lead with your AquaSense analyser.' },
  { icon: 'list-outline', title: 'Guided, step by step', body: 'Reagent steps, a reaction timer with alerts, and a camera cross-check for every reading.' },
  { icon: 'phone-portrait-outline', title: 'Your data stays here', body: 'Works fully offline. Results, photos and locations are stored only on this phone.' },
];

/** Screen 2 — Welcome. No permissions are requested here (all permissions are contextual). */
export default function Welcome() {
  const theme = useTheme();
  const [page, setPage] = useState(0);
  const updateSetting = useAppStore((s) => s.updateSetting);
  const p = PAGES[page]!;
  const last = page === PAGES.length - 1;

  const finish = async (pairNow: boolean) => {
    await updateSetting('onboardingComplete', true);
    if (pairNow) router.replace('/device/pair?onboarding=1');
    else router.replace('/(tabs)');
  };

  return (
    <SafeAreaView style={[styles.root, { backgroundColor: theme.colors.heroFrom }]} testID="welcome">
      <StatusBar style="light" />
      <View style={styles.ripples} pointerEvents="none">
        <Ripples size={460} opacity={0.1} />
      </View>
      <View style={styles.top}>
        <DropletLogo size={64} />
        <AppText variant="h2" style={styles.light}>
          AquaSense
        </AppText>
      </View>
      <View style={[styles.panel, { backgroundColor: theme.colors.surfaceGlass, borderRadius: theme.radii.xl }]}>
        <View style={[styles.icon, { backgroundColor: theme.colors.surfaceStrong }]}>
          <Ionicons name={p.icon} size={30} color={theme.colors.primary} />
        </View>
        <AppText variant="h1" align="center">
          {p.title}
        </AppText>
        <AppText color="muted" align="center">
          {p.body}
        </AppText>
        <View style={styles.dots} accessibilityLabel={`Page ${page + 1} of ${PAGES.length}`}>
          {PAGES.map((_, i) => (
            <View key={i} style={[styles.dot, { backgroundColor: i === page ? theme.colors.primary : theme.colors.border, width: i === page ? 22 : 8 }]} />
          ))}
        </View>
      </View>
      <View style={styles.actions}>
        {last ? (
          <>
            <Button label="Get started — pair analyser" icon="bluetooth" variant="secondary" onPress={() => void finish(true)} testID="welcome-pair" />
            <Button label="Pair later" variant="ghost" onDark onPress={() => void finish(false)} testID="welcome-later" />
          </>
        ) : (
          <>
            <Button label="Next" variant="secondary" onPress={() => setPage(page + 1)} testID="welcome-next" />
            <Button label="Skip" variant="ghost" onDark onPress={() => setPage(PAGES.length - 1)} />
          </>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, padding: 24, justifyContent: 'space-between' },
  ripples: { position: 'absolute', right: -140, top: -100 },
  top: { alignItems: 'center', gap: 8, marginTop: 24 },
  light: { color: '#FFFFFF' },
  panel: { padding: 24, gap: 14, alignItems: 'center' },
  icon: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', gap: 6, marginTop: 8 },
  dot: { height: 8, borderRadius: 4 },
  actions: { gap: 10 },
});
