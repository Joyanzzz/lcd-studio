/**
 * Límites centralizados del producto.
 *
 * Toda la interfaz, los validadores, los importadores y los exportadores
 * consultan este módulo. Ningún otro archivo debe definir números mágicos
 * equivalentes.
 */

import { AppError } from './errors.ts';

const MiB = 1024 * 1024;

export const LIMITS = Object.freeze({
  /** Lado máximo del lienzo en píxeles. */
  canvasMaxSide: 512,
  /** Lado mínimo del lienzo en píxeles. */
  canvasMinSide: 1,
  /** Número máximo de fotogramas por proyecto. */
  maxFrames: 240,
  /** Duración mínima por fotograma (ms). */
  frameDurationMinMs: 20,
  /** Duración máxima por fotograma (ms). */
  frameDurationMaxMs: 60_000,
  /** Duración por omisión de un fotograma nuevo (ms). */
  frameDurationDefaultMs: 200,
  /** Tamaño máximo de una imagen comprimida importada (bytes). */
  imageMaxCompressedBytes: 20 * MiB,
  /** Píxeles máximos de una imagen decodificada (16 megapíxeles). */
  imageMaxDecodedPixels: 16_000_000,
  /** Memoria máxima de trabajo para una secuencia importada (bytes). */
  importMaxWorkingBytes: 192 * MiB,
  /** Lado máximo de la copia de trabajo de cada cuadro importado. */
  importWorkingMaxSide: 2048,
  /** Tamaño máximo de un archivo de proyecto importado (bytes). */
  projectMaxFileBytes: 20 * MiB,
  /** Longitud máxima de nombres (proyecto, archivos, identificadores). */
  nameMaxLength: 64,
  /** Presupuesto máximo del historial de deshacer (bytes). */
  historyMaxBytes: 128 * MiB,
  /** Profundidad máxima del historial. */
  historyMaxDepth: 100,
  /** Tamaño máximo de un archivo de texto generado (bytes). */
  exportMaxTextBytes: 32 * MiB,
  /** Píxeles máximos de una imagen exportada (PNG, hoja de sprites o cuadro GIF). */
  exportMaxImagePixels: 16_777_216,
  /** Lado máximo de una imagen exportada. */
  exportMaxImageSide: 16_384,
  /** Píxeles totales máximos de un GIF (ancho × alto × cuadros). */
  exportMaxGifTotalPixels: 268_435_456,
  /** Escala máxima de exportación de imágenes. */
  exportMaxScale: 16,
  /** Lado máximo del lienzo del editor en píxeles de pantalla. */
  viewMaxCanvasSide: 8192,
  /** Zoom mínimo y máximo del editor (píxeles de pantalla por píxel). */
  zoomMin: 1,
  zoomMax: 32,
  /** Texto máximo del sello de texto. */
  textToolMaxLength: 64,
  /** Escala máxima del sello de texto. */
  textToolMaxScale: 4,
});

/** Error de límite o de aritmética inválida. */
export class LimitError extends AppError {
  constructor(code: string, params: Record<string, string | number> = {}) {
    super(code, params);
    this.name = 'LimitError';
  }
}

/** Verdadero solo para enteros seguros (excluye NaN, ±∞ y fracciones). */
export function isSafeInt(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value);
}

/** Verdadero para enteros seguros mayores o iguales que cero. */
export function isNonNegativeInt(value: unknown): value is number {
  return isSafeInt(value) && value >= 0;
}

/** Verdadero para enteros seguros dentro de [min, max]. */
export function isIntInRange(value: unknown, min: number, max: number): value is number {
  return isSafeInt(value) && value >= min && value <= max;
}

/**
 * Multiplica enteros no negativos y lanza si el resultado no es un entero
 * seguro o supera `max`.
 */
export function checkedMul(max: number, ...factors: number[]): number {
  let result = 1;
  for (const factor of factors) {
    if (!isNonNegativeInt(factor)) {
      throw new LimitError('limits.invalidNumber', { value: String(factor) });
    }
    result *= factor;
    if (!Number.isSafeInteger(result) || result > max) {
      throw new LimitError('limits.overflow', { max });
    }
  }
  return result;
}

/** Comprueba que las dimensiones del lienzo sean válidas. */
export function isValidCanvasSize(width: unknown, height: unknown): boolean {
  return (
    isIntInRange(width, LIMITS.canvasMinSide, LIMITS.canvasMaxSide) &&
    isIntInRange(height, LIMITS.canvasMinSide, LIMITS.canvasMaxSide)
  );
}

/** Lanza si las dimensiones del lienzo no son válidas. */
export function assertCanvasSize(width: number, height: number): void {
  if (!isValidCanvasSize(width, height)) {
    throw new LimitError('limits.canvasSize', {
      width: String(width),
      height: String(height),
      max: LIMITS.canvasMaxSide,
    });
  }
}

/** Comprueba que una duración de fotograma sea válida. */
export function isValidDuration(ms: unknown): ms is number {
  return isIntInRange(ms, LIMITS.frameDurationMinMs, LIMITS.frameDurationMaxMs);
}

/** Lleva un número a un rango entero válido; los valores no finitos usan `fallback`. */
export function clampInt(value: number, min: number, max: number, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  const rounded = Math.round(value);
  if (rounded < min) return min;
  if (rounded > max) return max;
  return rounded;
}

/** Comprueba el número de fotogramas. */
export function isValidFrameCount(count: unknown): count is number {
  return isIntInRange(count, 1, LIMITS.maxFrames);
}

/** Bytes que ocupa un fotograma en memoria (1 byte por píxel). */
export function frameMemoryBytes(width: number, height: number): number {
  assertCanvasSize(width, height);
  return checkedMul(Number.MAX_SAFE_INTEGER, width, height);
}

/**
 * Memoria esperada de un proyecto completo antes de reservarla. Lanza si las
 * dimensiones o el número de fotogramas no son válidos.
 */
export function projectMemoryBytes(width: number, height: number, frames: number): number {
  if (!isValidFrameCount(frames)) {
    throw new LimitError('limits.frameCount', { count: String(frames), max: LIMITS.maxFrames });
  }
  return checkedMul(Number.MAX_SAFE_INTEGER, frameMemoryBytes(width, height), frames);
}

/** Comprueba que una imagen decodificada quepa en el límite de megapíxeles. */
export function assertDecodedImageSize(width: number, height: number): void {
  if (!isIntInRange(width, 1, 65_535) || !isIntInRange(height, 1, 65_535)) {
    throw new LimitError('limits.imageDimensions', {
      width: String(width),
      height: String(height),
    });
  }
  const pixels = checkedMul(Number.MAX_SAFE_INTEGER, width, height);
  if (pixels > LIMITS.imageMaxDecodedPixels) {
    throw new LimitError('limits.imagePixels', {
      width,
      height,
      max: LIMITS.imageMaxDecodedPixels,
    });
  }
}

/** Longitud de un nombre en puntos de código (no en unidades UTF-16). */
export function nameLength(name: string): number {
  return Array.from(name).length;
}
