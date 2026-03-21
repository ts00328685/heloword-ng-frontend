import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en';
import zh from './locales/zh';
import ja from './locales/ja';

export type Language = 'en' | 'zh' | 'ja';

export const LANGUAGES: { code: Language; label: string }[] = [
  { code: 'en', label: 'EN' },
  { code: 'zh', label: '繁中' },
  { code: 'ja', label: '日' },
];

const savedLang = (localStorage.getItem('hw-lang') as Language) || 'en';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    ja: { translation: ja },
  },
  lng: savedLang,
  fallbackLng: 'en',
  interpolation: { escapeValue: false },
});

export const changeLanguage = (lang: Language) => {
  i18n.changeLanguage(lang);
  localStorage.setItem('hw-lang', lang);
};

export default i18n;
