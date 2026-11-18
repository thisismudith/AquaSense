/** Shared expo-router mock for screen tests. Use: jest.mock('expo-router', () => require('../helpers/routerMock').routerModule) */
import { Text } from 'react-native';
import { createElement } from 'react';

export const router = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), canGoBack: jest.fn(() => true), setParams: jest.fn() };
export let params: Record<string, string> = {};
export function setParams(p: Record<string, string>) {
  params = p;
}

export const routerModule = {
  router,
  useRouter: () => router,
  useLocalSearchParams: () => params,
  useFocusEffect: (cb: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useEffect } = require('react') as typeof import('react');
    useEffect(cb, [cb]);
  },
  Redirect: ({ href }: { href: string }) => createElement(Text, { testID: 'redirect' }, `redirect:${href}`),
  Link: ({ children }: { children: unknown }) => children,
  Stack: { Screen: () => null },
};
