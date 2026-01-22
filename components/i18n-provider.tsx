"use client";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode, } from "react";
import { type Locale, getT, getStoredLocale, setStoredLocale, type TranslationKey, } from "@/lib/i18n";
type I18nContextValue = {
    locale: Locale;
    setLocale: (locale: Locale) => void;
    t: (key: TranslationKey) => string;
};
const I18nContext = createContext<I18nContextValue | null>(null);
export function I18nProvider({ children }: {
    children: ReactNode;
}) {
    const [locale, setLocaleState] = useState<Locale>("en");
    useEffect(() => {
        setLocaleState(getStoredLocale());
    }, []);
    const setLocale = useCallback((next: Locale) => {
        setLocaleState(next);
        setStoredLocale(next);
    }, []);
    const t = useMemo(() => getT(locale), [locale]);
    const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);
    return (<I18nContext.Provider value={value}>
      {children}
    </I18nContext.Provider>);
}
export function useI18n() {
    const ctx = useContext(I18nContext);
    if (!ctx)
        throw new Error("useI18n must be used within I18nProvider");
    return ctx;
}
