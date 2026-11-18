import { Ionicons } from '@expo/vector-icons';
import { Tabs } from 'expo-router';

import { fonts } from '@/theme/tokens';
import { useTheme } from '@/theme/ThemeProvider';

export default function TabsLayout() {
  const t = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: t.colors.primary,
        tabBarInactiveTintColor: t.colors.textMuted,
        tabBarStyle: { backgroundColor: t.colors.surface, borderTopColor: t.colors.border },
        tabBarLabelStyle: { fontFamily: fonts.bodyMedium, fontSize: 11 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Home', tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="history" options={{ title: 'History', tabBarIcon: ({ color, size }) => <Ionicons name="time-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="samples" options={{ title: 'Samples', tabBarIcon: ({ color, size }) => <Ionicons name="flask-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="reagents" options={{ title: 'Reagents', tabBarIcon: ({ color, size }) => <Ionicons name="beaker-outline" color={color} size={size} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'More', tabBarIcon: ({ color, size }) => <Ionicons name="ellipsis-horizontal-circle-outline" color={color} size={size} /> }} />
    </Tabs>
  );
}
