import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { translations, Locale } from './translations';
import { translatePhrase } from './phrases';

export type { Locale } from './translations';

export interface I18nContextType {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  toggleLocale: () => void;
  t: (path: string, params?: Record<string, string | number>) => string;
  /** 短语级翻译：中文原文 → 当前语言（英文模式下查 phrases.ts 映射） */
  tr: (text: string, params?: Record<string, string | number>) => string;
}

export const STORAGE_KEY = 'dance_echo_locale';

const I18nContext = createContext<I18nContextType | null>(null);

export interface I18nProviderProps {
  children: React.ReactNode;
  defaultLocale?: Locale;
}

export const I18nProvider: React.FC<I18nProviderProps> = ({ children, defaultLocale = 'zh' }) => {
  const [locale, setLocaleState] = useState<Locale>(() => {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (saved === 'zh' || saved === 'en') {
          return saved;
        }
      }
    } catch (e) {
      console.warn('Failed to read locale from localStorage:', e);
    }
    return defaultLocale;
  });

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem(STORAGE_KEY, newLocale);
      }
      if (typeof document !== 'undefined') {
        document.documentElement.lang = newLocale === 'zh' ? 'zh-CN' : 'en';
      }
    } catch (e) {
      console.warn('Failed to persist locale to localStorage:', e);
    }
  }, []);

  const toggleLocale = useCallback(() => {
    setLocale(locale === 'zh' ? 'en' : 'zh');
  }, [locale, setLocale]);

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.lang = locale === 'zh' ? 'zh-CN' : 'en';
    }
  }, [locale]);

  const t = useCallback((path: string, params?: Record<string, string | number>): string => {
    const dict = translations[locale] || translations.zh;
    const parts = path.split('.');

    // 1. Traverse in the active language dictionary
    let curr: any = dict;
    let found = true;
    for (const part of parts) {
      if (curr && typeof curr === 'object' && part in curr) {
        curr = curr[part];
      } else {
        found = false;
        break;
      }
    }

    // 2. Fallback to Chinese dictionary if key is not found in active dictionary
    if (!found || typeof curr !== 'string') {
      let fallbackCurr: any = translations.zh;
      let fallbackFound = true;
      for (const part of parts) {
        if (fallbackCurr && typeof fallbackCurr === 'object' && part in fallbackCurr) {
          fallbackCurr = fallbackCurr[part];
        } else {
          fallbackFound = false;
          break;
        }
      }
      if (fallbackFound && typeof fallbackCurr === 'string') {
        curr = fallbackCurr;
      } else {
        return path;
      }
    }

    // 3. Interpolate parameters like {count}, {bpm}, {rating}
    if (params && typeof curr === 'string') {
      return Object.entries(params).reduce(
        (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
        curr
      );
    }

    return typeof curr === 'string' ? curr : path;
  }, [locale]);

  const tr = useCallback((text: string, params?: Record<string, string | number>): string => {
    const translated = translatePhrase(text, locale);
    if (!params) return translated;
    return Object.entries(params).reduce(
      (acc, [k, v]) => acc.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v)),
      translated
    );
  }, [locale]);

  const value = useMemo<I18nContextType>(() => ({
    locale,
    setLocale,
    toggleLocale,
    t,
    tr,
  }), [locale, setLocale, toggleLocale, t, tr]);

  return (
    <I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>
  );
};

export const useI18n = (): I18nContextType => {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
};
