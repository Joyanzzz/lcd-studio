import { detectSystemLocale, isLocale, type Locale } from '../ui/i18n/translate.ts';

/**
 * Preferencias de la interfaz en `localStorage` (solo comodidades por
 * usuario: nunca datos del proyecto). Cualquier fallo de lectura o escritura
 * se ignora y se usan los valores por omisión.
 */

export type ThemePreference = 'light' | 'dark' | 'system';

export interface Preferences {
  readonly locale: Locale;
  readonly theme: ThemePreference;
  readonly experimental: boolean;
  readonly exporter: string;
  readonly exportOptions: Readonly<Record<string, unknown>>;
  readonly grid: boolean;
  readonly markCells: boolean;
}

export const PREFERENCES_KEY = 'lcdstudio.preferences.v1';

export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

export function defaultPreferences(locale: Locale): Preferences {
  return {
    locale,
    theme: 'system',
    experimental: false,
    exporter: '',
    exportOptions: {},
    grid: true,
    markCells: true,
  };
}

/**
 * Carga las preferencias. Si no hay idioma guardado (primer inicio), lo
 * detecta del sistema y lo guarda; después solo cambia con el selector.
 */
export function loadPreferences(
  storage: KeyValueStorage | undefined,
  systemLanguages: readonly string[],
): Preferences {
  let raw: unknown;
  try {
    const text = storage?.getItem(PREFERENCES_KEY);
    raw = text ? JSON.parse(text) : null;
  } catch {
    raw = null;
  }
  const r =
    typeof raw === 'object' && raw !== null && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const firstRun = !isLocale(r['locale']);
  const locale = isLocale(r['locale']) ? r['locale'] : detectSystemLocale(systemLanguages);
  const d = defaultPreferences(locale);
  const prefs: Preferences = {
    locale,
    theme:
      r['theme'] === 'light' || r['theme'] === 'dark' || r['theme'] === 'system'
        ? r['theme']
        : d.theme,
    experimental: typeof r['experimental'] === 'boolean' ? r['experimental'] : d.experimental,
    exporter:
      typeof r['exporter'] === 'string' && r['exporter'].length <= 64 ? r['exporter'] : d.exporter,
    exportOptions:
      typeof r['exportOptions'] === 'object' &&
      r['exportOptions'] !== null &&
      !Array.isArray(r['exportOptions'])
        ? (r['exportOptions'] as Record<string, unknown>)
        : d.exportOptions,
    grid: typeof r['grid'] === 'boolean' ? r['grid'] : d.grid,
    markCells: typeof r['markCells'] === 'boolean' ? r['markCells'] : d.markCells,
  };
  if (firstRun) savePreferences(storage, prefs);
  return prefs;
}

export function savePreferences(storage: KeyValueStorage | undefined, prefs: Preferences): boolean {
  try {
    storage?.setItem(PREFERENCES_KEY, JSON.stringify(prefs));
    return storage !== undefined;
  } catch {
    return false;
  }
}

/** `localStorage` si existe y es accesible. */
export function browserStorage(): KeyValueStorage | undefined {
  try {
    return typeof localStorage === 'undefined' ? undefined : localStorage;
  } catch {
    return undefined;
  }
}
