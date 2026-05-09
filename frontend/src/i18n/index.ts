import i18n from 'i18next';
import LanguageDetector from 'i18next-browser-languagedetector';
import { initReactI18next } from 'react-i18next';

import en from './locales/en.json';
import zh from './locales/zh.json';
import zhHant from './locales/zh-Hant.json';
import ja from './locales/ja.json';

void i18n
    .use(LanguageDetector)
    .use(initReactI18next)
    .init({
        resources: {
            en: { translation: en },
            zh: { translation: zh },
            'zh-Hant': { translation: zhHant },
            'zh-TW': { translation: zhHant },
            'zh-HK': { translation: zhHant },
            'zh-MO': { translation: zhHant },
            ja: { translation: ja },
        },
        supportedLngs: ['en', 'zh', 'zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO', 'ja'],
        fallbackLng: 'en',
        interpolation: {
            escapeValue: false,
        },
        detection: {
            order: ['localStorage', 'navigator', 'htmlTag'],
            caches: ['localStorage'],
            lookupLocalStorage: 'appLanguage',
        },
    });

const syncDocumentLanguage = (language: string) => {
    document.documentElement.lang = language;
};

i18n.on('languageChanged', syncDocumentLanguage);

if (i18n.language) {
    syncDocumentLanguage(i18n.language);
}

export default i18n;
