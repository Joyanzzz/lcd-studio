import { GifReader } from 'omggif';
import { AppError } from '../../core/errors.ts';
import { assertDecodedImageSize, checkedMul, LIMITS } from '../../core/limits.ts';
import { rgbaToGraySource, workingSize, type GraySource } from './source.ts';

/**
 * Decodificación de GIF animado con `omggif` (decodificador LZW y lector de
 * bloques) y composición propia de cuadros.
 *
 * `omggif` no comprueba que cada cuadro quepa en el lienzo lógico ni limita
 * su tamaño, así que esta capa valida todo antes de reservar memoria. La
 * composición sigue el comportamiento de los navegadores: los métodos de
 * eliminación 2 (restaurar al fondo) dejan el área transparente y 3
 * (restaurar al anterior) vuelve al estado previo al cuadro.
 *
 * Se ejecuta dentro de un Web Worker que la interfaz puede terminar si el
 * archivo provoca un bucle o tarda demasiado.
 */

export interface GifDecodeOptions {
  readonly maxFrames?: number;
  readonly onProgress?: (done: number, total: number) => void;
  readonly isCancelled?: () => boolean;
}

/** Retardo de cuadro como lo interpretan los navegadores (0–1 cs → 100 ms). */
export function gifDelayToMs(centiseconds: number): number {
  const ms = centiseconds <= 1 ? 100 : centiseconds * 10;
  return Math.min(LIMITS.frameDurationMaxMs, Math.max(LIMITS.frameDurationMinMs, ms));
}

export function decodeGif(bytes: Uint8Array, options: GifDecodeOptions = {}): GraySource[] {
  const maxFrames = options.maxFrames ?? LIMITS.maxFrames;
  let reader: GifReader;
  try {
    reader = new GifReader(bytes);
  } catch {
    throw new AppError('image.corrupt');
  }
  const width = reader.width;
  const height = reader.height;
  assertDecodedImageSize(width, height);
  const frameCount = reader.numFrames();
  if (frameCount < 1) throw new AppError('image.corrupt');
  if (frameCount > maxFrames) {
    throw new AppError('image.tooManyFrames', { count: frameCount, max: maxFrames });
  }

  let needsPrevious = false;
  for (let i = 0; i < frameCount; i++) {
    const info = reader.frameInfo(i);
    if (
      !Number.isInteger(info.x) ||
      !Number.isInteger(info.y) ||
      info.width < 1 ||
      info.height < 1 ||
      info.x + info.width > width ||
      info.y + info.height > height
    ) {
      throw new AppError('image.gifFrameBounds', { frame: i + 1 });
    }
    if (info.palette_offset === null) throw new AppError('image.corrupt');
    if (info.disposal === 3) needsPrevious = true;
  }

  const target = workingSize(width, height, frameCount);
  const canvas = new Uint8Array(checkedMul(LIMITS.imageMaxDecodedPixels * 4, width, height, 4));
  const previous = needsPrevious ? new Uint8Array(canvas.length) : null;
  const out: GraySource[] = [];

  for (let i = 0; i < frameCount; i++) {
    if (options.isCancelled?.()) throw new AppError('task.cancelled');
    const info = reader.frameInfo(i);
    if (i > 0) {
      const prev = reader.frameInfo(i - 1);
      if (prev.disposal === 2) {
        for (let y = prev.y; y < prev.y + prev.height; y++) {
          canvas.fill(0, (y * width + prev.x) * 4, (y * width + prev.x + prev.width) * 4);
        }
      } else if (prev.disposal === 3 && previous) {
        canvas.set(previous);
      }
    }
    if (info.disposal === 3 && previous) previous.set(canvas);
    try {
      reader.decodeAndBlitFrameRGBA(i, canvas);
    } catch {
      throw new AppError('image.corrupt');
    }
    out.push(
      rgbaToGraySource(
        canvas,
        width,
        height,
        target.width,
        target.height,
        gifDelayToMs(info.delay),
      ),
    );
    options.onProgress?.(i + 1, frameCount);
  }
  return out;
}
