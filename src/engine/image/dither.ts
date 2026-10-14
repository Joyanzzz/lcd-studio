import type { DitherMode } from './params.ts';

/**
 * Conversión a 1 bit con aritmética entera exacta.
 *
 * Entrada: tonos 0–255. Salida: 1 = tono claro (≥ umbral), 0 = oscuro.
 * Los kernels de difusión de error solo dividen entre potencias de dos, de
 * modo que el resultado es idéntico en cualquier motor de JavaScript.
 */

type Kernel = readonly (readonly [dx: number, dy: number, weight: number])[];

/** Pesos sobre el divisor indicado. */
const KERNELS: Readonly<Record<string, { divisor: number; taps: Kernel }>> = {
  'floyd-steinberg': {
    divisor: 16,
    taps: [
      [1, 0, 7],
      [-1, 1, 3],
      [0, 1, 5],
      [1, 1, 1],
    ],
  },
  // Atkinson reparte solo 6/8 del error a propósito.
  atkinson: {
    divisor: 8,
    taps: [
      [1, 0, 1],
      [2, 0, 1],
      [-1, 1, 1],
      [0, 1, 1],
      [1, 1, 1],
      [0, 2, 1],
    ],
  },
  'sierra-lite': {
    divisor: 4,
    taps: [
      [1, 0, 2],
      [-1, 1, 1],
      [0, 1, 1],
    ],
  },
};

/** Matriz de Bayer de lado `n` (potencia de dos), valores 0 … n²-1. */
export function bayerMatrix(n: number): number[][] {
  if (!Number.isInteger(Math.log2(n)) || n < 2) throw new Error('n debe ser potencia de 2');
  let m: number[][] = [
    [0, 2],
    [3, 1],
  ];
  while (m.length < n) {
    const s = m.length;
    const next: number[][] = Array.from({ length: s * 2 }, () => new Array<number>(s * 2).fill(0));
    for (let y = 0; y < s; y++) {
      for (let x = 0; x < s; x++) {
        const v = m[y]![x]! * 4;
        next[y]![x] = v;
        next[y]![x + s] = v + 2;
        next[y + s]![x] = v + 3;
        next[y + s]![x + s] = v + 1;
      }
    }
    m = next;
  }
  return m;
}

const BAYER4 = bayerMatrix(4);
const BAYER8 = bayerMatrix(8);

export function dither(
  tones: Uint8Array,
  width: number,
  height: number,
  mode: DitherMode,
  threshold: number,
): Uint8Array {
  const out = new Uint8Array(width * height);
  if (mode === 'threshold') {
    for (let i = 0; i < out.length; i++) out[i] = tones[i]! >= threshold ? 1 : 0;
    return out;
  }
  if (mode === 'bayer4' || mode === 'bayer8') {
    const matrix = mode === 'bayer4' ? BAYER4 : BAYER8;
    const n = matrix.length;
    const nn = n * n;
    // Claro si tono + (128 - umbral) > 256·(m + ½)/n², en enteros: ×2n².
    for (let y = 0; y < height; y++) {
      const row = matrix[y % n]!;
      for (let x = 0; x < width; x++) {
        const shifted = tones[y * width + x]! + 128 - threshold;
        out[y * width + x] = shifted * 2 * nn > 256 * (2 * row[x % n]! + 1) ? 1 : 0;
      }
    }
    return out;
  }
  const kernel = KERNELS[mode];
  if (!kernel) throw new Error(`Tramado desconocido: ${mode}`);
  // Búfer en unidades enteras de 1/divisor de tono.
  const d = kernel.divisor;
  const buf = new Int32Array(width * height);
  for (let i = 0; i < buf.length; i++) buf[i] = tones[i]! * d;
  const limit = threshold * d;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      const old = buf[i]!;
      const lit = old >= limit ? 1 : 0;
      out[i] = lit;
      const err = old - (lit ? 255 * d : 0);
      if (err === 0) continue;
      for (const [dx, dy, w] of kernel.taps) {
        const xx = x + dx;
        const yy = y + dy;
        if (xx < 0 || xx >= width || yy >= height) continue;
        buf[yy * width + xx]! += Math.trunc((err * w) / d);
      }
    }
  }
  return out;
}
