import { useCallback } from 'react';

import { useAppStore } from '@/store/appStore';

import { translate, type TParams, type TranslationKey } from './index';

/** Re-renders on language change. */
export function useT() {
  const lang = useAppStore((s) => s.settings.language);
  return useCallback((key: TranslationKey, params?: TParams) => translate(key, params, lang), [lang]);
}
