import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Circle, Defs, Ellipse, Path, Stop, LinearGradient as SvgGradient } from 'react-native-svg';

import { useTheme } from '@/theme/ThemeProvider';

/** Water-droplet mark with a leaf highlight (brand identity). */
export function DropletLogo({ size = 72 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 64 64" accessibilityLabel="SipSure logo">
      <Defs>
        <SvgGradient id="drop" x1="0" y1="0" x2="0" y2="1">
          <Stop offset="0" stopColor="#7FD9CB" />
          <Stop offset="1" stopColor="#1B7A73" />
        </SvgGradient>
      </Defs>
      <Path d="M32 4 C32 4 12 28 12 41 a20 20 0 0 0 40 0 C52 28 32 4 32 4 Z" fill="url(#drop)" />
      <Path d="M24 40 c4 -10 14 -12 18 -10 c-2 8 -10 14 -18 10 Z" fill="#F1FBF8" opacity={0.85} />
      <Ellipse cx="24" cy="30" rx="3" ry="6" fill="#FFFFFF" opacity={0.5} />
    </Svg>
  );
}

/** Ripple rings — decorative, hidden from screen readers. */
export function Ripples({ size = 320, color = '#FFFFFF', opacity = 0.12 }: { size?: number; color?: string; opacity?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 100 100" accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {[46, 36, 26, 16].map((r, i) => (
        <Circle key={r} cx="50" cy="50" r={r} stroke={color} strokeWidth={0.6} fill="none" opacity={opacity * (1 + i * 0.4)} />
      ))}
    </Svg>
  );
}

/** Teal gradient hero with ripple detail (stands in for water photography; see DECISIONS D13). */
export function Hero({ children, style, height }: { children: ReactNode; style?: StyleProp<ViewStyle>; height?: number }) {
  const t = useTheme();
  return (
    <LinearGradient colors={[t.colors.heroFrom, t.colors.heroTo]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.hero, { borderRadius: t.radii.xl, minHeight: height }, style]}>
      <View style={styles.ripple} pointerEvents="none">
        <Ripples size={260} />
      </View>
      {children}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  hero: { padding: 20, overflow: 'hidden', gap: 12 },
  ripple: { position: 'absolute', right: -80, top: -90 },
});
