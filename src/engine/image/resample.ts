import type { GraySource } from './source.ts';
import type { ImageParams } from './params.ts';

/**
 * Encuadre y remuestreo deterministas de una imagen de trabajo al tamaño del
 * lienzo. Solo usa operaciones aritméticas básicas (IEEE 754 con redondeo
 * exacto), así que da los mismos valores en todos los motores de JavaScript.
 */

/** Compone luminancia sobre el fondo elegido: resultado 0–255 entero. */
export function compositeOnBackground(
  source: GraySource,
  background: 'white' | 'black',
): Uint8Array {
  const bg = background === 'white' ? 255 : 0;
  const out = new Uint8Array(source.luma.length);
  for (let i = 0; i < out.length; i++) {
    const a = source.alpha[i]!;
    out[i] = a === 255 ? source.luma[i]! : Math.round((source.luma[i]! * a + bg * (255 - a)) / 255);
  }
  return out;
}

/** Imagen integral (sumas acumuladas) con una fila y columna de ceros. */
export function integralImage(gray: Uint8Array, width: number, height: number): Float64Array {
  const stride = width + 1;
  const table = new Float64Array(stride * (height + 1));
  for (let y = 0; y < height; y++) {
    let rowSum = 0;
    for (let x = 0; x < width; x++) {
      rowSum += gray[y * width + x]!;
      table[(y + 1) * stride + x + 1] = table[y * stride + x + 1]! + rowSum;
    }
  }
  return table;
}

export interface Placement {
  /** Escala horizontal y vertical (píxeles destino por píxel origen, tras rotar). */
  readonly kx: number;
  readonly ky: number;
  /** Centro de la imagen en el lienzo. */
  readonly cx: number;
  readonly cy: number;
}

export function computePlacement(
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
  params: ImageParams,
): Placement {
  const quarter = params.rotation === 90 || params.rotation === 270;
  const rw = quarter ? sourceHeight : sourceWidth;
  const rh = quarter ? sourceWidth : sourceHeight;
  let kx: number;
  let ky: number;
  switch (params.fit) {
    case 'stretch':
      kx = targetWidth / rw;
      ky = targetHeight / rh;
      break;
    case 'original':
      kx = ky = 1;
      break;
    case 'cover':
      kx = ky = Math.max(targetWidth / rw, targetHeight / rh);
      break;
    case 'contain':
    default:
      kx = ky = Math.min(targetWidth / rw, targetHeight / rh);
  }
  const s = params.scalePercent / 100;
  return {
    kx: kx * s,
    ky: ky * s,
    cx: targetWidth / 2 + params.offsetX,
    cy: targetHeight / 2 + params.offsetY,
  };
}

/**
 * Transforma un punto del lienzo a coordenadas de la imagen origen:
 * inversa de traslación → escala → rotación → volteo.
 */
function toSource(
  tx: number,
  ty: number,
  p: Placement,
  params: ImageParams,
  sw: number,
  sh: number,
): [number, number] {
  let u = (tx - p.cx) / p.kx;
  let v = (ty - p.cy) / p.ky;
  // Rotación inversa (las rotaciones del lienzo son en sentido horario).
  let ru: number;
  let rv: number;
  switch (params.rotation) {
    case 90:
      ru = v;
      rv = -u;
      break;
    case 180:
      ru = -u;
      rv = -v;
      break;
    case 270:
      ru = -v;
      rv = u;
      break;
    default:
      ru = u;
      rv = v;
  }
  if (params.flipH) ru = -ru;
  if (params.flipV) rv = -rv;
  u = ru + sw / 2;
  v = rv + sh / 2;
  return [u, v];
}

/**
 * Genera la imagen en gris del tamaño del lienzo. Usa media por áreas al
 * reducir y bilineal al ampliar; fuera de la imagen se usa el fondo.
 */
export function resampleToTarget(
  composite: Uint8Array,
  integral: Float64Array,
  sw: number,
  sh: number,
  targetWidth: number,
  targetHeight: number,
  params: ImageParams,
): Uint8Array {
  const bg = params.background === 'white' ? 255 : 0;
  const p = computePlacement(sw, sh, targetWidth, targetHeight, params);
  const out = new Uint8Array(targetWidth * targetHeight);
  const stride = sw + 1;
  // Dentro de la imagen se sujeta al borde para no mezclarlo con el fondo.
  const sample = (x: number, y: number) => {
    const cx = x < 0 ? 0 : x >= sw ? sw - 1 : x;
    const cy = y < 0 ? 0 : y >= sh ? sh - 1 : y;
    return composite[cy * sw + cx]!;
  };

  for (let ty = 0; ty < targetHeight; ty++) {
    for (let tx = 0; tx < targetWidth; tx++) {
      const [ax, ay] = toSource(tx, ty, p, params, sw, sh);
      const [bx, by] = toSource(tx + 1, ty + 1, p, params, sw, sh);
      const minX = Math.min(ax, bx);
      const maxX = Math.max(ax, bx);
      const minY = Math.min(ay, by);
      const maxY = Math.max(ay, by);
      let value: number;
      if (maxX - minX >= 1 || maxY - minY >= 1) {
        // Reducción: media del área cubierta.
        const x0 = Math.round(minX);
        const y0 = Math.round(minY);
        const x1 = Math.max(x0 + 1, Math.round(maxX));
        const y1 = Math.max(y0 + 1, Math.round(maxY));
        const area = (x1 - x0) * (y1 - y0);
        const cx0 = Math.min(Math.max(x0, 0), sw);
        const cx1 = Math.min(Math.max(x1, 0), sw);
        const cy0 = Math.min(Math.max(y0, 0), sh);
        const cy1 = Math.min(Math.max(y1, 0), sh);
        let sum = 0;
        let inside = 0;
        if (cx1 > cx0 && cy1 > cy0) {
          sum =
            integral[cy1 * stride + cx1]! -
            integral[cy0 * stride + cx1]! -
            integral[cy1 * stride + cx0]! +
            integral[cy0 * stride + cx0]!;
          inside = (cx1 - cx0) * (cy1 - cy0);
        }
        value = Math.round((sum + bg * (area - inside)) / area);
      } else {
        // Ampliación: bilineal en el centro del píxel destino.
        const [u, v] = toSource(tx + 0.5, ty + 0.5, p, params, sw, sh);
        if (u < 0 || v < 0 || u > sw || v > sh) {
          out[ty * targetWidth + tx] = bg;
          continue;
        }
        const fx = u - 0.5;
        const fy = v - 0.5;
        const x0 = Math.floor(fx);
        const y0 = Math.floor(fy);
        const wx = fx - x0;
        const wy = fy - y0;
        const top = sample(x0, y0) * (1 - wx) + sample(x0 + 1, y0) * wx;
        const bottom = sample(x0, y0 + 1) * (1 - wx) + sample(x0 + 1, y0 + 1) * wx;
        value = Math.round(top * (1 - wy) + bottom * wy);
      }
      out[ty * targetWidth + tx] = value < 0 ? 0 : value > 255 ? 255 : value;
    }
  }
  return out;
}
