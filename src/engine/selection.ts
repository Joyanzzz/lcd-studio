import type { Point } from './geometry.ts';

/** Rectángulo de selección en píxeles del lienzo (x, y, ancho, alto). */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/** Contenido copiado al portapapeles interno. */
export interface Clip {
  readonly width: number;
  readonly height: number;
  readonly data: Uint8Array;
}

/** Rectángulo entre dos puntos (ambos incluidos). */
export function rectFromPoints(a: Point, b: Point): Rect {
  const x = Math.min(a.x, b.x);
  const y = Math.min(a.y, b.y);
  return { x, y, width: Math.abs(a.x - b.x) + 1, height: Math.abs(a.y - b.y) + 1 };
}

/** Intersección con el lienzo; `undefined` si queda vacía. */
export function clipRect(rect: Rect, width: number, height: number): Rect | undefined {
  const x0 = Math.max(0, rect.x);
  const y0 = Math.max(0, rect.y);
  const x1 = Math.min(width, rect.x + rect.width);
  const y1 = Math.min(height, rect.y + rect.height);
  if (x1 <= x0 || y1 <= y0) return undefined;
  return { x: x0, y: y0, width: x1 - x0, height: y1 - y0 };
}

export function rectContains(rect: Rect, p: Point): boolean {
  return p.x >= rect.x && p.y >= rect.y && p.x < rect.x + rect.width && p.y < rect.y + rect.height;
}

/** Copia la región (las zonas fuera del lienzo quedan apagadas). */
export function extractRegion(pixels: Uint8Array, width: number, height: number, rect: Rect): Clip {
  const data = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y++) {
    const sy = rect.y + y;
    if (sy < 0 || sy >= height) continue;
    for (let x = 0; x < rect.width; x++) {
      const sx = rect.x + x;
      if (sx < 0 || sx >= width) continue;
      data[y * rect.width + x] = pixels[sy * width + sx] ? 1 : 0;
    }
  }
  return { width: rect.width, height: rect.height, data };
}

/** Apaga (o enciende) la región en el sitio. */
export function fillRegion(
  pixels: Uint8Array,
  width: number,
  height: number,
  rect: Rect,
  value: 0 | 1,
): void {
  const r = clipRect(rect, width, height);
  if (!r) return;
  for (let y = r.y; y < r.y + r.height; y++)
    pixels.fill(value, y * width + r.x, y * width + r.x + r.width);
}

/** Estampa `clip` con su esquina superior izquierda en (x, y), recortando. */
export function stampClip(
  pixels: Uint8Array,
  width: number,
  height: number,
  clip: Clip,
  x: number,
  y: number,
  mode: 'replace' | 'or' = 'replace',
): void {
  for (let cy = 0; cy < clip.height; cy++) {
    const ty = y + cy;
    if (ty < 0 || ty >= height) continue;
    for (let cx = 0; cx < clip.width; cx++) {
      const tx = x + cx;
      if (tx < 0 || tx >= width) continue;
      const v = clip.data[cy * clip.width + cx] ? 1 : 0;
      if (mode === 'replace') pixels[ty * width + tx] = v;
      else if (v) pixels[ty * width + tx] = 1;
    }
  }
}

/**
 * Mueve el contenido de `rect` a `rect` desplazado por (dx, dy) sobre una
 * copia de `base`. Si `copy` es verdadero, el origen se conserva.
 */
export function moveRegion(
  base: Uint8Array,
  width: number,
  height: number,
  rect: Rect,
  dx: number,
  dy: number,
  copy: boolean,
): Uint8Array {
  const out = base.slice();
  const clip = extractRegion(base, width, height, rect);
  if (!copy) fillRegion(out, width, height, rect, 0);
  stampClip(out, width, height, clip, rect.x + dx, rect.y + dy);
  return out;
}
