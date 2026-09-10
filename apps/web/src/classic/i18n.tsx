"use client";

import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { defaultLocale, direction, type Locale, locales, t } from "../locale";

export const localeStorageKey = "scriora.locale";

export function parseLocale(value: string | null): Locale {
  return locales.find((item) => item === value) ?? defaultLocale;
}

export function applyDocumentLocale(locale: Locale) {
  document.documentElement.lang = locale;
  document.documentElement.dir = direction(locale);
}

const ClassicI18n = createContext({
  locale: defaultLocale,
  copy: t(defaultLocale),
  setLocale: (_locale: Locale) => {},
});

export function ClassicI18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(defaultLocale);

  useEffect(() => {
    const stored = parseLocale(window.localStorage.getItem(localeStorageKey));
    setLocaleState(stored);
    applyDocumentLocale(stored);
  }, []);

  const value = useMemo(
    () => ({
      locale,
      copy: t(locale),
      setLocale(next: Locale) {
        setLocaleState(next);
        window.localStorage.setItem(localeStorageKey, next);
        applyDocumentLocale(next);
      },
    }),
    [locale],
  );

  return <ClassicI18n.Provider value={value}>{children}</ClassicI18n.Provider>;
}

export function useClassicI18n() {
  return useContext(ClassicI18n);
}
