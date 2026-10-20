import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import { SUPPORTED_LOCALES, type Locale } from '@lams/shared';
import en from './locales/en.json';
import hi from './locales/hi.json';

const STORAGE_KEY = 'lams.locale';

function initialLocale(): Locale {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved && (SUPPORTED_LOCALES as readonly string[]).includes(saved)) return saved as Locale;
  } catch {
    /* storage blocked: fall through */
  }
  return navigator.language?.toLowerCase().startsWith('hi') ? 'hi' : 'en';
}

// Adding a language = add locales/<code>.json, register it here and in SUPPORTED_LOCALES.
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en }, hi: { translation: hi } },
  lng: initialLocale(),
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

i18n.on('languageChanged', (lng) => {
  document.documentElement.lang = lng;
  try {
    localStorage.setItem(STORAGE_KEY, lng);
  } catch {
    /* ignore */
  }
});
document.documentElement.lang = i18n.language;

export default i18n;
