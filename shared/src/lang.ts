/**
 * Languages for the phone UI and spoken commands (DESIGN.md §1). The driver
 * picks one in settings; it defaults to the phone's language. Matchmaking
 * ignores it.
 */
export const LANGS = ['en', 'fr', 'es', 'vi'] as const;
export type Lang = (typeof LANGS)[number];

export const isLang = (x: unknown): x is Lang => LANGS.includes(x as Lang);

/** Each language's name in that language, for the picker. */
export const LANG_NAMES: Record<Lang, string> = {
  en: 'English',
  fr: 'Français',
  es: 'Español',
  vi: 'Tiếng Việt',
};

/** Google Speech-to-Text language codes. es-US: this is a US demo. */
export const STT_LANGUAGE: Record<Lang, string> = {
  en: 'en-US',
  fr: 'fr-FR',
  es: 'es-US',
  vi: 'vi-VN',
};
