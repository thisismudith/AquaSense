/** SipSure design tokens — deep teal / aquatic green, mint translucent panels (SCREENSHOT_CATALOG). */
export const palette = {
  teal950: '#06201F',
  teal900: '#0A2F2D',
  teal800: '#0F4C4A',
  teal700: '#145E5A',
  teal600: '#1B7A73',
  teal500: '#23968C',
  aqua400: '#3FC1B0',
  aqua300: '#7FD9CB',
  mint200: '#BFEDE3',
  mint100: '#DDF5EF',
  mint50: '#F1FBF8',
  white: '#FFFFFF',
  ink900: '#0E1B1A',
  ink700: '#2E4342',
  ink500: '#5B6F6D',
  ink300: '#9AABA9',
  ink100: '#E3EAE9',
  amber500: '#D98A1B',
  amber100: '#FCEFD9',
  red600: '#C2412D',
  red100: '#FBE3DE',
  green600: '#2E8B57',
  green100: '#DDF3E6',
  blue600: '#2F6FA8',
  blue100: '#DEEBF7',
  violet500: '#7B4FC4',
  magenta500: '#C23A8A',
  pink400: '#E0679C',
  orange500: '#E07A2E',
} as const;

export interface ThemeColors {
  background: string;
  backgroundAlt: string;
  surface: string;
  surfaceGlass: string;
  surfaceStrong: string;
  border: string;
  text: string;
  textMuted: string;
  textOnPrimary: string;
  primary: string;
  primaryPressed: string;
  accent: string;
  heroFrom: string;
  heroTo: string;
  success: string;
  successBg: string;
  warning: string;
  warningBg: string;
  danger: string;
  dangerBg: string;
  info: string;
  infoBg: string;
  overlay: string;
  tint: Record<'violet' | 'magenta' | 'pink' | 'amber', string>;
}

export const lightColors: ThemeColors = {
  background: palette.mint50,
  backgroundAlt: palette.mint100,
  surface: palette.white,
  surfaceGlass: 'rgba(255,255,255,0.78)',
  surfaceStrong: palette.mint100,
  border: palette.ink100,
  text: palette.ink900,
  textMuted: palette.ink500,
  textOnPrimary: palette.white,
  primary: palette.teal800,
  primaryPressed: palette.teal900,
  accent: palette.aqua400,
  heroFrom: palette.teal800,
  heroTo: palette.teal500,
  success: palette.green600,
  successBg: palette.green100,
  warning: palette.amber500,
  warningBg: palette.amber100,
  danger: palette.red600,
  dangerBg: palette.red100,
  info: palette.blue600,
  infoBg: palette.blue100,
  overlay: 'rgba(6,32,31,0.45)',
  tint: { violet: palette.violet500, magenta: palette.magenta500, pink: palette.pink400, amber: palette.orange500 },
};

export const darkColors: ThemeColors = {
  background: palette.teal950,
  backgroundAlt: palette.teal900,
  surface: '#0E2A28',
  surfaceGlass: 'rgba(20,60,57,0.72)',
  surfaceStrong: '#143A37',
  border: '#1E4A46',
  text: '#E7F5F2',
  textMuted: '#9FC0BB',
  textOnPrimary: palette.teal950,
  primary: palette.aqua400,
  primaryPressed: palette.aqua300,
  accent: palette.aqua300,
  heroFrom: palette.teal900,
  heroTo: palette.teal700,
  success: '#5CC98E',
  successBg: '#123826',
  warning: '#F0B04A',
  warningBg: '#3A2A10',
  danger: '#F07560',
  dangerBg: '#3D1A14',
  info: '#79B4E8',
  infoBg: '#14293D',
  overlay: 'rgba(0,0,0,0.6)',
  tint: { violet: '#A98BE6', magenta: '#E57AB6', pink: '#F29BC0', amber: '#F2A15E' },
};

export const fonts = {
  display: 'DMSerifDisplay_400Regular',
  body: 'Inter_400Regular',
  bodyMedium: 'Inter_500Medium',
  bodySemi: 'Inter_600SemiBold',
  bodyBold: 'Inter_700Bold',
  mono: 'JetBrainsMono_400Regular',
  monoMedium: 'JetBrainsMono_500Medium',
} as const;

export const typography = {
  display: { fontFamily: fonts.display, fontSize: 34, lineHeight: 40 },
  h1: { fontFamily: fonts.display, fontSize: 28, lineHeight: 34 },
  h2: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28 },
  title: { fontFamily: fonts.bodySemi, fontSize: 17, lineHeight: 22 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 21 },
  bodyStrong: { fontFamily: fonts.bodySemi, fontSize: 15, lineHeight: 21 },
  caption: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18 },
  label: { fontFamily: fonts.bodyMedium, fontSize: 12, lineHeight: 16, letterSpacing: 0.4 },
  mono: { fontFamily: fonts.mono, fontSize: 14, lineHeight: 20 },
  monoLarge: { fontFamily: fonts.monoMedium, fontSize: 40, lineHeight: 46 },
} as const;
export type TypographyVariant = keyof typeof typography;

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32, xxxl: 48 } as const;
export const radii = { sm: 8, md: 14, lg: 20, xl: 28, pill: 999 } as const;

export const shadow = {
  card: { shadowColor: '#06201F', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  raised: { shadowColor: '#06201F', shadowOpacity: 0.14, shadowRadius: 18, shadowOffset: { width: 0, height: 8 }, elevation: 5 },
} as const;

export interface Theme {
  dark: boolean;
  colors: ThemeColors;
  spacing: typeof spacing;
  radii: typeof radii;
  typography: typeof typography;
  shadow: typeof shadow;
}

export const lightTheme: Theme = { dark: false, colors: lightColors, spacing, radii, typography, shadow };
export const darkTheme: Theme = { dark: true, colors: darkColors, spacing, radii, typography, shadow };
