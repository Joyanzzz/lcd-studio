/**
 * Primitivas geométricas en coordenadas enteras. Cada función llama a
 * `plot(x, y)` para cada píxel; el recorte lo hace quien dibuja.
 */

export type Plot = (x: number, y: number) => void;

export interface Point {
  readonly x: number;
  readonly y: number;
}

/** Línea de Bresenham, incluye ambos extremos. */
export function plotLine(x0: number, y0: number, x1: number, y1: number, plot: Plot): void {
  const dx = Math.abs(x1 - x0);
  const dy = -Math.abs(y1 - y0);
  const sx = x0 < x1 ? 1 : -1;
  const sy = y0 < y1 ? 1 : -1;
  let err = dx + dy;
  let x = x0;
  let y = y0;
  for (;;) {
    plot(x, y);
    if (x === x1 && y === y1) break;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** Rectángulo definido por dos esquinas opuestas (incluidas). */
export function plotRect(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
  plot: Plot,
): void {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  for (let y = top; y <= bottom; y++) {
    if (filled || y === top || y === bottom) {
      for (let x = left; x <= right; x++) plot(x, y);
    } else {
      plot(left, y);
      if (right !== left) plot(right, y);
    }
  }
}

/**
 * Elipse inscrita en el rectángulo de esquinas (x0,y0)–(x1,y1), algoritmo de
 * A. Zingl ("A Rasterizing Algorithm for Drawing Curves", 2012). Los puntos
 * se recortan al rectángulo y se emiten una sola vez.
 */
export function plotEllipse(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  filled: boolean,
  plot: Plot,
): void {
  const left = Math.min(x0, x1);
  const right = Math.max(x0, x1);
  const top = Math.min(y0, y1);
  const bottom = Math.max(y0, y1);
  const minX = new Map<number, number>();
  const maxX = new Map<number, number>();
  const seen = new Set<number>();
  const width = right - left + 1;
  const add = (x: number, y: number) => {
    if (x < left || x > right || y < top || y > bottom) return;
    const key = (y - top) * width + (x - left);
    if (!seen.has(key)) {
      seen.add(key);
      if (!filled) plot(x, y);
    }
    const mn = minX.get(y);
    if (mn === undefined || x < mn) minX.set(y, x);
    const mx = maxX.get(y);
    if (mx === undefined || x > mx) maxX.set(y, x);
  };

  let a = right - left;
  const b = bottom - top;
  let b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  let xa = left;
  let xb = right;
  let ya = top + ((b + 1) >> 1);
  let yb = ya - b1;
  a = 8 * a * a;
  b1 = 8 * b * b;
  do {
    add(xb, ya);
    add(xa, ya);
    add(xa, yb);
    add(xb, yb);
    const e2 = 2 * err;
    if (e2 <= dy) {
      ya++;
      yb--;
      dy += a;
      err += dy;
    }
    if (e2 >= dx || 2 * err > dy) {
      xa++;
      xb--;
      dx += b1;
      err += dx;
    }
  } while (xa <= xb);
  while (ya - yb <= b) {
    add(xa - 1, ya);
    add(xb + 1, ya);
    ya++;
    add(xa - 1, yb);
    add(xb + 1, yb);
    yb--;
  }

  if (filled) {
    const rows = [...minX.keys()].sort((p, q) => p - q);
    for (const y of rows) {
      const from = minX.get(y)!;
      const to = maxX.get(y)!;
      for (let x = from; x <= to; x++) plot(x, y);
    }
  }
}

/**
 * Restringe el extremo de una forma (tecla Mayús): líneas a 0°, 45° o 90°;
 * rectángulos y elipses a proporción 1:1.
 */
export function constrainEnd(start: Point, end: Point, kind: 'line' | 'box'): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (kind === 'box') {
    const side = Math.max(Math.abs(dx), Math.abs(dy));
    return { x: start.x + Math.sign(dx || 1) * side, y: start.y + Math.sign(dy || 1) * side };
  }
  const adx = Math.abs(dx);
  const ady = Math.abs(dy);
  if (adx > 2 * ady) return { x: end.x, y: start.y };
  if (ady > 2 * adx) return { x: start.x, y: end.y };
  const d = Math.max(adx, ady);
  return { x: start.x + Math.sign(dx) * d, y: start.y + Math.sign(dy) * d };
}
