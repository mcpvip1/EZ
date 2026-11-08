// Language system for the EASY 2D web app.
// Default language is Myanmar ('my'); the choice persists in
// localStorage under 'easy2d.lang'. English ('en') is the second locale.
// Numerals stay Arabic digits 0-9 in both locales — the dictionaries
// never contain Myanmar digits. t() falls back to English, then to the
// key itself, so a missing Myanmar string never blanks the UI.
import { createContext, useContext, useState, type ReactNode } from 'react';
import { en } from './en';
import { my } from './my';

export type Lang = 'my' | 'en';
export type Dict = Record<string, string>;

const LANG_KEY = 'easy2d.lang';
const dicts: Record<Lang, Dict> = { my, en };

export function getInitialLang(): Lang {
  try {
    const v = localStorage.getItem(LANG_KEY);
    if (v === 'my' || v === 'en') return v;
  } catch {
    // storage unavailable — default still applies
  }
  return 'my';
}

function format(s: string, params?: Record<string, string | number>): string {
  if (!params) return s;
  return s.replace(/\{(\w+)\}/g, (_, k) => String(params[k] ?? `{${k}}`));
}

export interface LangCtx {
  lang: Lang;
  setLang: (l: Lang) => void;
  /** Translate a dictionary key; params fill {name} placeholders. */
  t: (key: string, params?: Record<string, string | number>) => string;
}

const Ctx = createContext<LangCtx>({
  lang: 'my',
  setLang: () => undefined,
  t: (k) => k,
});

export function LanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>(getInitialLang);
  const setLang = (l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem(LANG_KEY, l);
    } catch {
      // storage unavailable — the choice just lasts for this session
    }
  };
  const t = (key: string, params?: Record<string, string | number>) => {
    const s = dicts[lang][key] ?? en[key] ?? key;
    return format(s, params);
  };
  return <Ctx.Provider value={{ lang, setLang, t }}>{children}</Ctx.Provider>;
}

export function useLang(): LangCtx {
  return useContext(Ctx);
}
