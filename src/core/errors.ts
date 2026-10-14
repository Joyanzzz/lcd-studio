/**
 * Errores de dominio con código estable y parámetros.
 *
 * El núcleo no genera texto para el usuario: devuelve un código que la
 * interfaz traduce (ver `src/ui/i18n`). Así el núcleo sigue siendo puro y las
 * traducciones futuras no tocan la lógica.
 */

export type ErrorParams = Readonly<Record<string, string | number>>;

export class AppError extends Error {
  readonly code: string;
  readonly params: ErrorParams;

  constructor(code: string, params: Record<string, string | number> = {}) {
    super(code);
    this.name = 'AppError';
    this.code = code;
    this.params = Object.freeze({ ...params });
  }
}

export function isAppError(value: unknown): value is AppError {
  return value instanceof AppError;
}

/** Resultado explícito para operaciones que pueden fallar de forma esperada. */
export type Result<T> =
  | { readonly ok: true; readonly value: T; readonly warnings: readonly Issue[] }
  | { readonly ok: false; readonly errors: readonly Issue[] };

export interface Issue {
  readonly code: string;
  readonly params?: ErrorParams;
  /** Ruta dentro del documento (p. ej. `frames.3.data`). */
  readonly path?: string;
}

export function ok<T>(value: T, warnings: readonly Issue[] = []): Result<T> {
  return { ok: true, value, warnings };
}

export function fail<T = never>(errors: readonly Issue[]): Result<T> {
  return { ok: false, errors };
}

export function issue(
  code: string,
  params?: Record<string, string | number>,
  path?: string,
): Issue {
  const result: { code: string; params?: ErrorParams; path?: string } = { code };
  if (params) result.params = Object.freeze({ ...params });
  if (path !== undefined) result.path = path;
  return result;
}
