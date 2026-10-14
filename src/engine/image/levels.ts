import type { ImageParams } from './params.ts';

/** Histograma de 256 niveles. */
export function histogram(gray: Uint8Array): Uint32Array {
  const h = new Uint32Array(256);
  for (let i = 0; i < gray.length; i++) h[gray[i]!]!++;
  return h;
}

/**
 * Tabla de niveles: negro/blanco de entrada, gamma, contraste y brillo. Se
 * calcula una vez por cambio de parámetros y se redondea a enteros, de modo
 * que el tramado posterior trabaja solo con enteros.
 */
export function levelsLut(params: ImageParams): Uint8Array {
  const lut = new Uint8Array(256);
  const bp = params.blackPoint / 255;
  const wp = params.whitePoint / 255;
  const invGamma = 100 / params.gammaCenti;
  const contrast = Math.pow(4, params.contrast / 100);
  const brightness = params.brightness / 200;
  for (let i = 0; i < 256; i++) {
    let v = (i / 255 - bp) / (wp - bp);
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    v = Math.pow(v, invGamma);
    v = (v - 0.5) * contrast + 0.5 + brightness;
    v = v < 0 ? 0 : v > 1 ? 1 : v;
    let out = Math.round(v * 255);
    if (params.invert) out = 255 - out;
    lut[i] = out;
  }
  return lut;
}

export function applyLut(gray: Uint8Array, lut: Uint8Array): Uint8Array {
  const out = new Uint8Array(gray.length);
  for (let i = 0; i < gray.length; i++) out[i] = lut[gray[i]!]!;
  return out;
}

/** Niveles automáticos: recorta el 0,5 % de cada extremo del histograma. */
export function autoLevels(hist: Uint32Array): { blackPoint: number; whitePoint: number } {
  let total = 0;
  for (let i = 0; i < 256; i++) total += hist[i]!;
  if (total === 0) return { blackPoint: 0, whitePoint: 255 };
  const cut = total * 0.005;
  let acc = 0;
  let lo = 0;
  for (let i = 0; i < 256; i++) {
    acc += hist[i]!;
    if (acc > cut) {
      lo = i;
      break;
    }
  }
  acc = 0;
  let hi = 255;
  for (let i = 255; i >= 0; i--) {
    acc += hist[i]!;
    if (acc > cut) {
      hi = i;
      break;
    }
  }
  if (hi - lo < 4) return { blackPoint: 0, whitePoint: 255 };
  return { blackPoint: Math.min(lo, 254), whitePoint: Math.max(hi, lo + 1) };
}
