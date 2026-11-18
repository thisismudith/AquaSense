import { DMSerifDisplay_400Regular } from '@expo-google-fonts/dm-serif-display';
import { Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from '@expo-google-fonts/jetbrains-mono';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { MockBanner } from '@/components/domain';
import { bootApp } from '@/services/boot';
import { useAppStore } from '@/store/appStore';
import { ThemeProvider, useTheme } from '@/theme/ThemeProvider';

function ThemedStack() {
  const t = useTheme();
  const mock = useAppStore((s) => s.services?.transportKind === 'mock');
  return (
    <>
      <StatusBar style={t.dark ? 'light' : 'dark'} />
      {mock ? <MockBanner /> : null}
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: t.colors.background }, animation: 'slide_from_right' }} />
    </>
  );
}

export default function RootLayout() {
  const [fontsLoaded, fontError] = useFonts({
    DMSerifDisplay_400Regular,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
  });
  const theme = useAppStore((s) => s.settings.theme);

  useEffect(() => {
    void bootApp();
  }, []);

  useEffect(() => {
    if (fontError) console.warn('[fonts] failed to load, falling back to system fonts', fontError);
  }, [fontError]);

  if (!fontsLoaded && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider preference={theme}>
        <ThemedStack />
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
