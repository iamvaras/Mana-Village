import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { AppError, Language } from '@mana/core';
import { loadLanguage, saveLanguage } from '@/lib/preferences';
import type { Strings } from './en';
import { STRINGS, interpolate } from './translate';

interface I18nValue {
  language: Language;
  setLanguage(language: Language): void;
  s: Strings;
  /** Text with `{placeholders}` filled in. */
  f(text: string, vars: Readonly<Record<string, string>>): string;
  /** User-facing message for an error, in the current language. */
  errorText(error: AppError): string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  // Telugu first: most residents read Telugu.
  const [language, setLanguageState] = useState<Language>('te');

  useEffect(() => {
    void loadLanguage().then((saved) => {
      if (saved) setLanguageState(saved);
    });
  }, []);

  const value = useMemo<I18nValue>(() => {
    const s = STRINGS[language];
    return {
      language,
      setLanguage(next) {
        setLanguageState(next);
        void saveLanguage(next);
      },
      s,
      f: interpolate,
      errorText: (error) => s.errors[error.code],
    };
  }, [language]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used inside I18nProvider');
  return ctx;
}
