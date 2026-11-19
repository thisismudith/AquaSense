import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { Keyboard, Pressable, RefreshControl, ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/theme/ThemeProvider';

import { AppText } from './AppText';

/** Extra space kept between the keyboard and the content, so a focused field and its hint/error stay visible. */
const KEYBOARD_GAP = 40;

/**
 * Space the open keyboard takes over the content area (0 when closed). Used instead of KeyboardAvoidingView:
 * with Android edge-to-edge (Android 15+) the window is not resized for the keyboard, and KeyboardAvoidingView
 * left stale bottom padding after the keyboard closed.
 */
function useKeyboardInset(): number {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);
  // SafeAreaView already pads the bottom system bar, which the keyboard covers too.
  return height > 0 ? Math.max(0, height - insets.bottom) + KEYBOARD_GAP : 0;
}

export function Screen({
  children,
  scroll = true,
  padded = true,
  title,
  back,
  right,
  refreshing,
  onRefresh,
  contentStyle,
  testID,
  footer,
}: {
  children: ReactNode;
  scroll?: boolean;
  padded?: boolean;
  title?: string;
  back?: boolean | (() => void);
  right?: ReactNode;
  refreshing?: boolean;
  onRefresh?: () => void;
  contentStyle?: StyleProp<ViewStyle>;
  testID?: string;
  footer?: ReactNode;
}) {
  const t = useTheme();
  const keyboard = useKeyboardInset();
  const pad = padded ? { padding: t.spacing.lg, gap: t.spacing.lg } : null;
  return (
    <SafeAreaView testID={testID} style={[styles.root, { backgroundColor: t.colors.background }]} edges={['top', 'left', 'right', 'bottom']}>
      {(title || back) && (
        <View style={[styles.header, { paddingHorizontal: t.spacing.lg }]}>
          {back ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Back"
              hitSlop={12}
              onPress={() => (typeof back === 'function' ? back() : router.canGoBack() ? router.back() : router.replace('/'))}
              style={styles.backBtn}
            >
              <Ionicons name="chevron-back" size={24} color={t.colors.primary} />
            </Pressable>
          ) : null}
          <AppText variant="h2" numberOfLines={1} style={styles.title}>
            {title ?? ''}
          </AppText>
          <View>{right}</View>
        </View>
      )}
      <View style={[styles.root, { paddingBottom: keyboard }]}>
        {scroll ? (
          <ScrollView
            contentContainerStyle={[pad, contentStyle]}
            keyboardShouldPersistTaps="handled"
            refreshControl={onRefresh ? <RefreshControl refreshing={!!refreshing} onRefresh={onRefresh} tintColor={t.colors.primary} /> : undefined}
          >
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.root, pad, contentStyle]}>{children}</View>
        )}
        {footer ? <View style={{ padding: t.spacing.lg, paddingTop: t.spacing.sm, gap: t.spacing.sm }}>{footer}</View> : null}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: 'row', alignItems: 'center', minHeight: 52, gap: 8 },
  backBtn: { width: 32, height: 44, justifyContent: 'center' },
  title: { flex: 1 },
});
