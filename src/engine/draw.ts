import { plotEllipse, plotLine, plotRect, type Plot } from './geometry.ts';

export interface Symmetry {
  /** Espejo respecto al eje vertical (izquierda ↔ derecha). */
  readonly horizontal: boolean;
  /** Espejo respecto al eje horizontal (arriba ↔ abajo). */
  readonly vertical: boolean;
}

export const NO_SYMMETRY: Symmetry = Object.freeze({ horizontal: false, vertical: false });

/** Rectángulo sucio (región modificada) en píxeles del lienzo. */
export interface DirtyRect {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
}

/**
 * Lienzo de trabajo para una operación de dibujo: escribe en un arreglo
 * propio, recorta a los límites, aplica simetría y acumula la región sucia.
 */
export class DrawSurface {
  readonly width: number;
  readonly height: number;
  readonly pixels: Uint8Array;
  readonly symmetry: Symmetry;
  dirty: DirtyRect | null = null;

  constructor(width: number, height: number, pixels: Uint8Array, symmetry: Symmetry = NO_SYMMETRY) {
    if (pixels.length !== width * height) throw new Error('Tamaño de lienzo incoherente');
    this.width = width;
    this.height = height;
    this.pixels = pixels;
    this.symmetry = symmetry;
  }

  private put(x: number, y: number, value: 0 | 1): void {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return;
    this.pixels[y * this.width + x] = value;
    const d = this.dirty;
    if (!d) this.dirty = { x0: x, y0: y, x1: x, y1: y };
    else {
      if (x < d.x0) d.x0 = x;
      if (y < d.y0) d.y0 = y;
      if (x > d.x1) d.x1 = x;
      if (y > d.y1) d.y1 = y;
    }
  }

  /** Dibuja un píxel y sus reflejos según la simetría activa. */
  plot(x: number, y: number, value: 0 | 1): void {
    const { horizontal, vertical } = this.symmetry;
    const mx = this.width - 1 - x;
    const my = this.height - 1 - y;
    this.put(x, y, value);
    if (horizontal) this.put(mx, y, value);
    if (vertical) this.put(x, my, value);
    if (horizontal && vertical) this.put(mx, my, value);
  }

  plotter(value: 0 | 1): Plot {
    return (x, y) => this.plot(x, y, value);
  }

  line(x0: number, y0: number, x1: number, y1: number, value: 0 | 1): void {
    plotLine(x0, y0, x1, y1, this.plotter(value));
  }

  rect(x0: number, y0: number, x1: number, y1: number, filled: boolean, value: 0 | 1): void {
    plotRect(x0, y0, x1, y1, filled, this.plotter(value));
  }

  ellipse(x0: number, y0: number, x1: number, y1: number, filled: boolean, value: 0 | 1): void {
    plotEllipse(x0, y0, x1, y1, filled, this.plotter(value));
  }

  /** Restaura todos los píxeles desde `base` (vista previa de formas). */
  restore(base: Uint8Array): void {
    this.pixels.set(base);
    this.dirty = { x0: 0, y0: 0, x1: this.width - 1, y1: this.height - 1 };
  }
}
