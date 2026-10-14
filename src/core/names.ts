import { LIMITS } from './limits.ts';

/**
 * Saneamiento de nombres de proyecto, nombres de archivo e identificadores C.
 */

const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[0-9¹²³]|lpt[0-9¹²³])$/i;
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u001f\u007f-\u009f]/g;
const FORBIDDEN_FILE_CHARS = /[<>:"/\\|?*]/g;

/** Corta a `max` puntos de código sin partir pares sustitutos. */
export function truncateCodePoints(text: string, max: number): string {
  const cps = Array.from(text);
  return cps.length <= max ? text : cps.slice(0, max).join('');
}

/** Nombre de proyecto: sin caracteres de control, espacios colapsados, 1–64 puntos de código. */
export function sanitizeProjectName(name: string, fallback = 'proyecto'): string {
  const cleaned = name.normalize('NFC').replace(CONTROL, ' ').replace(/\s+/g, ' ').trim();
  const truncated = truncateCodePoints(cleaned, LIMITS.nameMaxLength).trim();
  return truncated.length > 0 ? truncated : fallback;
}

export function isValidProjectName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && sanitizeProjectName(name, '') === name;
}

/**
 * Nombre base de archivo seguro en Windows, macOS y Linux: sin rutas, sin
 * caracteres reservados, sin nombres de dispositivo de Windows y sin puntos o
 * espacios finales. No incluye la extensión.
 */
export function sanitizeFileBaseName(name: string, fallback = 'lcd-studio'): string {
  let base = name
    .normalize('NFC')
    .replace(CONTROL, '')
    .replace(FORBIDDEN_FILE_CHARS, '_')
    .replace(/\s+/g, ' ')
    .trim();
  base = base.replace(/^[.\s]+/, '').replace(/[.\s]+$/, '');
  base = truncateCodePoints(base, LIMITS.nameMaxLength)
    .replace(/[.\s]+$/, '')
    .trim();
  if (base.length === 0) base = fallback;
  const stem = base.split('.')[0] ?? base;
  if (WINDOWS_RESERVED.test(stem)) base = `_${base}`;
  return truncateCodePoints(base, LIMITS.nameMaxLength);
}

/** Nombre de archivo completo saneado con extensión fija (p. ej. `.png`). */
export function safeFileName(base: string, extension: string): string {
  if (!/^\.[a-z0-9]+(\.[a-z0-9]+)*$/.test(extension)) {
    throw new Error(`Extensión no válida: ${extension}`);
  }
  return sanitizeFileBaseName(base) + extension;
}

const C_KEYWORDS = new Set([
  'alignas',
  'alignof',
  'and',
  'and_eq',
  'asm',
  'auto',
  'bitand',
  'bitor',
  'bool',
  'break',
  'case',
  'catch',
  'char',
  'char16_t',
  'char32_t',
  'char8_t',
  'class',
  'compl',
  'concept',
  'const',
  'consteval',
  'constexpr',
  'constinit',
  'const_cast',
  'continue',
  'co_await',
  'co_return',
  'co_yield',
  'decltype',
  'default',
  'delete',
  'do',
  'double',
  'dynamic_cast',
  'else',
  'enum',
  'explicit',
  'export',
  'extern',
  'false',
  'float',
  'for',
  'friend',
  'goto',
  'if',
  'inline',
  'int',
  'long',
  'mutable',
  'namespace',
  'new',
  'noexcept',
  'not',
  'not_eq',
  'nullptr',
  'operator',
  'or',
  'or_eq',
  'private',
  'protected',
  'public',
  'register',
  'reinterpret_cast',
  'requires',
  'restrict',
  'return',
  'short',
  'signed',
  'sizeof',
  'static',
  'static_assert',
  'static_cast',
  'struct',
  'switch',
  'template',
  'this',
  'thread_local',
  'throw',
  'true',
  'try',
  'typedef',
  'typeid',
  'typename',
  'union',
  'unsigned',
  'using',
  'virtual',
  'void',
  'volatile',
  'wchar_t',
  'while',
  'xor',
  'xor_eq',
  '_Bool',
  '_Complex',
  '_Imaginary',
  // Nombres que chocarían con Arduino, AVR o XC8.
  'setup',
  'loop',
  'main',
  'byte',
  'word',
  'boolean',
  'lcd',
  'display',
  'u8g2',
  'delay',
  'millis',
  'pgm_read_byte',
  'pgm_read_word',
  'PROGMEM',
  'HIGH',
  'LOW',
  'INPUT',
  'OUTPUT',
]);

/**
 * Identificador C/C++ seguro: solo ASCII `[A-Za-z0-9_]`, sin empezar por dígito,
 * sin doble guion bajo inicial (reservado), sin palabras clave y con un máximo
 * de 64 caracteres.
 */
export function toCIdentifier(name: string, fallback = 'imagen'): string {
  let id = name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9_]+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+/, '')
    .replace(/_+$/, '');
  if (id.length === 0) id = fallback;
  if (/^[0-9]/.test(id)) id = `img_${id}`;
  id = id.slice(0, LIMITS.nameMaxLength - 1);
  if (C_KEYWORDS.has(id) || C_KEYWORDS.has(id.toLowerCase())) id = `${id}_`;
  return id.replace(/_+$/, '_');
}

export function isValidCIdentifier(id: string): boolean {
  return (
    /^[A-Za-z][A-Za-z0-9_]*$/.test(id) &&
    id.length <= LIMITS.nameMaxLength &&
    !C_KEYWORDS.has(id) &&
    !C_KEYWORDS.has(id.toLowerCase())
  );
}
