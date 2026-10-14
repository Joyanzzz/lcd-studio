import { AppError } from '../../core/errors.ts';
import { checkedMul, LIMITS } from '../../core/limits.ts';

/**
 * Copia de trabajo de una imagen importada: luminancia y alfa en 8 bits.
 * Se guarda así (2 bytes por píxel) para que el fondo de las zonas
 * transparentes se pueda cambiar sin volver a decodificar.
 */
export interface GraySource {
  readonly width: number;
  readonly height: number;
  /** Luminancia Rec. 601 entera, 0–255. */
  readonly luma: Uint8Array;
  /** Opacidad, 0–255. */
  readonly alpha: Uint8Array;
  /** Duración del cuadro en ms (GIF) o la duración por omisión. */
  readonly durationMs: number;
}

/** Luminancia entera determinista (Rec. 601). */
export function lumaOf(r: number, g: number, b: number): number {
  return Math.floor((299 * r + 587 * g + 114 * b + 500) / 1000);
}

/** Tamaño de trabajo para no superar `maxSide` ni el presupuesto de memoria. */
export function workingSize(
  width: number,
  height: number,
  frameCount: number,
  maxSide: number = LIMITS.importWorkingMaxSide,
  budgetBytes: number = LIMITS.importMaxWorkingBytes,
): { width: number; height: number } {
  let scale = Math.min(1, maxSide / Math.max(width, height));
  const bytesAtScale = (s: number) =>
    Math.max(1, Math.round(width * s)) * Math.max(1, Math.round(height * s)) * 2 * frameCount;
  if (bytesAtScale(scale) > budgetBytes) {
    scale = Math.min(scale, Math.sqrt(budgetBytes / (width * height * 2 * frameCount)));
    while (scale > 0 && bytesAtScale(scale) > budgetBytes) scale *= 0.99;
  }
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  if (bytesAtScale(w / width) > budgetBytes * 1.01) throw new AppError('image.tooManyPixels');
  return { width: w, height: h };
}

/**
 * Reduce un RGBA (no premultiplicado) a luminancia+alfa con un filtro de caja
 * entero. Si el tamaño destino coincide, solo convierte.
 */
export function rgbaToGraySource(
  rgba: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  targetWidth: number,
  targetHeight: number,
  durationMs: number,
): GraySource {
  const pixels = checkedMul(Number.MAX_SAFE_INTEGER, width, height);
  if (rgba.length !== pixels * 4) throw new AppError('image.corrupt');
  if (targetWidth > width || targetHeight > height) throw new Error('Solo se admite reducir');
  const luma = new Uint8Array(targetWidth * targetHeight);
  const alpha = new Uint8Array(targetWidth * targetHeight);
  if (targetWidth === width && targetHeight === height) {
    for (let i = 0, p = 0; i < pixels; i++, p += 4) {
      luma[i] = lumaOf(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!);
      alpha[i] = rgba[p + 3]!;
    }
    return { width, height, luma, alpha, durationMs };
  }
  for (let ty = 0; ty < targetHeight; ty++) {
    const sy0 = Math.floor((ty * height) / targetHeight);
    const sy1 = Math.max(sy0 + 1, Math.floor(((ty + 1) * height) / targetHeight));
    for (let tx = 0; tx < targetWidth; tx++) {
      const sx0 = Math.floor((tx * width) / targetWidth);
      const sx1 = Math.max(sx0 + 1, Math.floor(((tx + 1) * width) / targetWidth));
      let sumA = 0;
      let sumLA = 0;
      let count = 0;
      for (let sy = sy0; sy < sy1; sy++) {
        let p = (sy * width + sx0) * 4;
        for (let sx = sx0; sx < sx1; sx++, p += 4) {
          const a = rgba[p + 3]!;
          sumA += a;
          sumLA += lumaOf(rgba[p]!, rgba[p + 1]!, rgba[p + 2]!) * a;
          count++;
        }
      }
      const t = ty * targetWidth + tx;
      alpha[t] = Math.round(sumA / count);
      luma[t] = sumA > 0 ? Math.round(sumLA / sumA) : 0;
    }
  }
  return { width: targetWidth, height: targetHeight, luma, alpha, durationMs };
}
