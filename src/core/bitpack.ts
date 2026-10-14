import { AppError } from './errors.ts';

/**
 * Empaquetado de almacenamiento (formato de proyecto v1 y v2):
 * el píxel `i` (orden fila por fila) ocupa el bit `i & 7` del byte `i >> 3`,
 * es decir, LSB primero. Los bits sobrantes del último byte deben ser cero.
 */

export function packedLength(pixelCount: number): number {
  if (!Number.isSafeInteger(pixelCount) || pixelCount < 0) {
    throw new AppError('bitpack.invalidCount', { count: String(pixelCount) });
  }
  return Math.ceil(pixelCount / 8);
}

export function packBits(pixels: Uint8Array): Uint8Array {
  const out = new Uint8Array(packedLength(pixels.length));
  for (let i = 0; i < pixels.length; i++) {
    if (pixels[i]) out[i >> 3]! |= 1 << (i & 7);
  }
  return out;
}

/**
 * Desempaqueta exactamente `pixelCount` píxeles. Lanza si la longitud no es la
 * exacta o si hay bits de relleno distintos de cero (archivo manipulado).
 */
export function unpackBits(packed: Uint8Array, pixelCount: number): Uint8Array {
  const expected = packedLength(pixelCount);
  if (packed.length !== expected) {
    throw new AppError('bitpack.lengthMismatch', { expected, actual: packed.length });
  }
  const rem = pixelCount & 7;
  if (rem !== 0 && expected > 0) {
    const padding = packed[expected - 1]! >> rem;
    if (padding !== 0) throw new AppError('bitpack.nonZeroPadding');
  }
  const out = new Uint8Array(pixelCount);
  for (let i = 0; i < pixelCount; i++) {
    out[i] = (packed[i >> 3]! >> (i & 7)) & 1;
  }
  return out;
}
