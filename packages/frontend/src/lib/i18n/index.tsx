import { createContext, createElement, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { en, type TranslationKey } from './en';
import { id } from './id';

export type Lang = 'id' | 'en';

const dictionaries: Record<Lang, Record<TranslationKey, string>> = { en, id };
const STORAGE_KEY = 'skoolcein.lang';

function initialLang(): Lang {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === 'id' || stored === 'en') return stored;
  } catch {
    /* storage unavailable (private mode) */
  }
  return typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('en') ? 'en' : 'id';
}

type Vars = Record<string, string | number>;

function interpolate(template: string, vars?: Vars) {
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (k in vars ? String(vars[k]) : `{${k}}`));
}

type I18nValue = {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Plain-text translation. */
  t: (key: TranslationKey, vars?: Vars) => string;
  /** Translation that may contain <strong>…</strong>; returns React nodes. Other markup is not supported. */
  tr: (key: TranslationKey, vars?: Vars) => ReactNode;
};

// In dev, Vite re-evaluates this module when a dictionary (en.ts / id.ts) changes. A fresh createContext()
// would then be a DIFFERENT context from the one the already-mounted <I18nProvider> publishes, and every
// consumer would throw "useI18n must be used within an I18nProvider". Reusing the previous instance keeps
// the provider and its consumers on the same context across hot updates. (No effect in production builds.)
const I18nContext: React.Context<I18nValue | undefined> =
  (import.meta.hot?.data.i18nContext as React.Context<I18nValue | undefined> | undefined) ??
  createContext<I18nValue | undefined>(undefined);
if (import.meta.hot) import.meta.hot.data.i18nContext = I18nContext;

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(initialLang);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    if (typeof document !== 'undefined') document.documentElement.lang = l;
  }, []);

  const value = useMemo<I18nValue>(() => {
    const t = (key: TranslationKey, vars?: Vars) => interpolate(dictionaries[lang][key] ?? en[key], vars);
    const tr = (key: TranslationKey, vars?: Vars): ReactNode => {
      const parts = t(key, vars).split(/(<strong>.*?<\/strong>)/g);
      return parts.map((p, i) =>
        p.startsWith('<strong>') ? createElement('strong', { key: i }, p.slice(8, -9)) : p,
      );
    };
    return { lang, setLang, t, tr };
  }, [lang, setLang]);

  return createElement(I18nContext.Provider, { value }, children);
}

export function useI18n(): I18nValue {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error('useI18n must be used within an I18nProvider');
  return ctx;
}

/** Shorthand: `const { t, tr } = useT()`. */
export const useT = useI18n;
