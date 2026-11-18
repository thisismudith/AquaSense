import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme } from 'react-native';

import { darkTheme, lightTheme, type Theme } from './tokens';

export type ThemePreference = 'light' | 'dark' | 'system';

const ThemeContext = createContext<Theme>(lightTheme);

/** Light is the default; 'system' follows the OS colour scheme. */
export function resolveTheme(pref: ThemePreference, system: 'light' | 'dark' | null | undefined): Theme {
  if (pref === 'dark') return darkTheme;
  if (pref === 'system' && system === 'dark') return darkTheme;
  return lightTheme;
}

export function ThemeProvider({ preference, children }: { preference: ThemePreference; children: ReactNode }) {
  const system = useColorScheme();
  const theme = useMemo(() => resolveTheme(preference, system), [preference, system]);
  return <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>;
}

export const useTheme = (): Theme => useContext(ThemeContext);
