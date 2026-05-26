// src/i18n/index.js — TEMPORARY TEST VERSION (FIXED)
import i18n from 'i18next'; // ✅ Correct: 'i18next' NOT '18next'
import { initReactI18next } from 'react-i18next';

// ✅ TEMPORARY: Hardcode language for testing (skip RNLocalize)
const deviceLang = 'en'; // Change to 'fr' to test French

import en from './locales/en/common.json';
import fr from './locales/fr/common.json';

const resources = {
  en: { translation: en },
  fr: { translation: fr },
};

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng: deviceLang,
    fallbackLng: 'en',
    interpolation: { escapeValue: false },
    compatibilityJSON: 'v3',
    react: { useSuspense: false },
  });

export default i18n;