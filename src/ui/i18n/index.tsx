import { createContext, useContext, useMemo, type ReactNode } from 'react';
import type { Issue } from '../../core/errors.ts';
import { en } from './en.ts';
import { es, type MessageKey } from './es.ts';
import { createTranslator, type Locale, type Params, type Translator } from './translate.ts';

export type { Locale } from './translate.ts';
export { LOCALES } from './translate.ts';
export type { MessageKey } from './es.ts';

const DICTIONARIES = { es, en } as const;

export interface I18nValue extends Translator {
  /** Traducción con clave comprobada por TypeScript. */
  readonly tk: (key: MessageKey, params?: Params) => string;
  readonly setLocale: (locale: Locale) => void;
  /** Traduce un problema del núcleo (código + parámetros + ruta). */
  readonly issue: (issue: Issue) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

export function createI18nValue(locale: Locale, setLocale: (l: Locale) => void): I18nValue {
  // El español actúa como reserva: nunca se muestra una clave cruda si falta una traducción.
  const tr = createTranslator(locale, DICTIONARIES[locale], es);
  return {
    ...tr,
    tk: (key, params) => tr.t(key, params),
    setLocale,
    issue: (i) =>
      tr.t(i.code, { ...(i.params ?? {}), ...(i.path !== undefined ? { path: i.path } : {}) }),
  };
}

export function I18nProvider(props: {
  locale: Locale;
  setLocale: (l: Locale) => void;
  children: ReactNode;
}) {
  const { locale, setLocale, children } = props;
  const value = useMemo(() => createI18nValue(locale, setLocale), [locale, setLocale]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nValue {
  const value = useContext(I18nContext);
  if (!value) throw new Error('useI18n fuera de I18nProvider');
  return value;
}
