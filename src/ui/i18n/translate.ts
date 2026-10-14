/**
 * Motor de traducción puro (sin React ni DOM) para poder probarlo en Node.
 *
 * - Los mensajes usan `{nombre}` para interpolar parámetros.
 * - Los números se formatean con las reglas del idioma activo.
 * - Un parámetro de texto que empieza por `@` es a su vez una clave
 *   (p. ej. `@board.arduino-uno`) y se traduce.
 * - Una clave con el prefijo `literal:` se muestra tal cual (p. ej.
 *   direcciones I²C como `0x3C`, que no se traducen).
 * - Las claves internas, el formato de proyecto, los identificadores de código
 *   y los datos binarios nunca pasan por aquí.
 */

export type Locale = 'es' | 'en';
export const LOCALES: readonly Locale[] = ['es', 'en'];
export const DEFAULT_LOCALE: Locale = 'es';

export type Params = Readonly<Record<string, string | number>>;

export type Dictionary = Readonly<Record<string, string>>;

export function isLocale(value: unknown): value is Locale {
  return value === 'es' || value === 'en';
}

export function createTranslator(locale: Locale, dictionary: Dictionary, fallback?: Dictionary) {
  const numbers = new Intl.NumberFormat(locale === 'es' ? 'es-ES' : 'en-US', {
    maximumFractionDigits: 2,
  });

  function lookup(key: string): string | undefined {
    if (key.startsWith('literal:')) return key.slice('literal:'.length);
    return dictionary[key] ?? fallback?.[key];
  }

  function translate(key: string, params?: Params): string {
    const template = lookup(key);
    if (template === undefined) return key;
    if (!params) return template;
    return template.replace(/\{([a-zA-Z0-9_]+)\}/g, (match, name: string) => {
      const value = params[name];
      if (value === undefined) return match;
      if (typeof value === 'number') return numbers.format(value);
      if (value.startsWith('@')) return translate(value.slice(1));
      return value;
    });
  }

  function has(key: string): boolean {
    return lookup(key) !== undefined;
  }

  return { locale, t: translate, has, formatNumber: (n: number) => numbers.format(n) };
}

export type Translator = ReturnType<typeof createTranslator>;

/** Marcadores `{x}` de un mensaje, para comprobar que ambos idiomas coinciden. */
export function placeholders(message: string): string[] {
  return [...message.matchAll(/\{([a-zA-Z0-9_]+)\}/g)].map((m) => m[1]!).sort();
}

/** Idioma del sistema: inglés si la primera preferencia es inglés, si no español. */
export function detectSystemLocale(languages: readonly string[]): Locale {
  for (const lang of languages) {
    const base = lang.toLowerCase().split(/[-_]/)[0];
    if (base === 'es') return 'es';
    if (base === 'en') return 'en';
  }
  return DEFAULT_LOCALE;
}
