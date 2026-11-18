import { en, type TranslationKey } from './en';

/**
 * A14: English complete; other languages add a dictionary with the same keys (missing keys fall back to English).
 */
export const LANGUAGES = { en: { label: 'English', nativeLabel: 'English', dict: en } } as const;
export type LanguageCode = keyof typeof LANGUAGES;
export type { TranslationKey };

let current: LanguageCode = 'en';

export function setLanguage(code: LanguageCode): void {
  current = code;
}

export function getLanguage(): LanguageCode {
  return current;
}

export type TParams = Record<string, string | number>;

export function translate(key: TranslationKey, params?: TParams, lang: LanguageCode = current): string {
  const dict: Partial<Record<TranslationKey, string>> = LANGUAGES[lang].dict;
  const template = dict[key] ?? en[key] ?? key;
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (m, name: string) => (name in params ? String(params[name]) : m));
}

export const t = translate;
