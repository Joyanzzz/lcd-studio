import { hexToRgb, type LcdColors } from '../../core/appearance.ts';
import type { CellRef } from '../../core/charlcd.ts';
import type { DirtyRect } from '../../engine/draw.ts';
import type { Point } from '../../engine/geometry.ts';
import type { Rect } from '../../engine/selection.ts';
import { pixelLeft, pixelTop, type CanvasLayout } from './layout.ts';

/**
 * Renderizador del lienzo por capas:
 *   marco → cristal → píxeles apagados → papel cebolla → píxeles encendidos →
 *   celdas incompatibles → selección → cursor.
 *
 * Los píxeles encendidos se guardan en un lienzo auxiliar 1:1 que solo se
 * actualiza en la región modificada; la composición final usa `drawImage`
 * escalado sin suavizado, que la GPU resuelve en una sola operación.
 */

export interface OnionLayer {
  readonly pixels: Uint8Array;
  readonly relation: 'before' | 'after';
  /** 0–1. */
  readonly alpha: number;
}

export interface RenderInput {
  readonly layout: CanvasLayout;
  readonly pixels: Uint8Array;
  readonly colors: LcdColors;
  readonly grid: boolean;
  readonly onion: readonly OnionLayer[];
  readonly selection: Rect | null;
  readonly overflow: readonly CellRef[];
  readonly cursor: Point | null;
  readonly devicePixelRatio: number;
}

const ONION_BEFORE: [number, number, number] = [230, 60, 60];
const ONION_AFTER: [number, number, number] = [40, 170, 90];

export class LcdRenderer {
  private readonly canvas: HTMLCanvasElement;
  private readonly onLayer: HTMLCanvasElement;
  private onImage: ImageData | null = null;
  private onionCanvases: HTMLCanvasElement[] = [];
  private onionKeys: { pixels: Uint8Array; relation: string }[] = [];
  private lastPixels: Uint8Array | null = null;
  private lastOnColor = '';

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.onLayer = document.createElement('canvas');
  }

  render(input: RenderInput, dirty: DirtyRect | null = null): void {
    const { layout, pixels, colors } = input;
    const w = layout.pixelWidth;
    const h = layout.pixelHeight;
    const dpr = input.devicePixelRatio;
    const targetW = Math.round(layout.width * dpr);
    const targetH = Math.round(layout.height * dpr);
    if (this.canvas.width !== targetW || this.canvas.height !== targetH) {
      this.canvas.width = targetW;
      this.canvas.height = targetH;
    }
    this.canvas.style.width = `${layout.width}px`;
    this.canvas.style.height = `${layout.height}px`;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    this.updateOnLayer(pixels, w, h, colors.on, dirty);

    // Marco y cristal.
    ctx.fillStyle = colors.frame;
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.fillStyle = colors.screen;
    const z = layout.zoom;
    if (layout.charMode) {
      for (let cy = 0; cy < h / 8; cy++) {
        for (let cx = 0; cx < w / 5; cx++) {
          ctx.fillRect(
            pixelLeft(layout, cx * 5) - 2,
            pixelTop(layout, cy * 8) - 2,
            5 * z + 4,
            8 * z + 4,
          );
        }
      }
    } else {
      const m = Math.max(2, Math.round(z / 2));
      ctx.fillRect(layout.pad - m, layout.pad - m, w * z + 2 * m, h * z + 2 * m);
    }

    // Píxeles apagados (todo el área de píxeles en color "apagado").
    ctx.fillStyle = colors.off;
    this.forEachBlock(layout, (x, y, bw, bh) => ctx.fillRect(x, y, bw, bh));

    // Papel cebolla.
    this.ensureOnionCanvases(input.onion, w, h);
    input.onion.forEach((layer, i) => {
      ctx.globalAlpha = layer.alpha;
      this.drawLayer(ctx, layout, this.onionCanvases[i]!);
    });
    ctx.globalAlpha = 1;

    // Píxeles encendidos.
    this.drawLayer(ctx, layout, this.onLayer);

    // Rejilla: líneas del color del cristal entre píxeles.
    if (input.grid && z >= 4) {
      ctx.fillStyle = colors.screen;
      ctx.globalAlpha = 0.55;
      for (let x = 1; x < w; x++) {
        if (layout.charMode && x % 5 === 0) continue;
        const sx = pixelLeft(layout, x);
        ctx.fillRect(sx, layout.pad, 1, layout.height - 2 * layout.pad);
      }
      for (let y = 1; y < h; y++) {
        if (layout.charMode && y % 8 === 0) continue;
        const sy = pixelTop(layout, y);
        ctx.fillRect(layout.pad, sy, layout.width - 2 * layout.pad, 1);
      }
      ctx.globalAlpha = 1;
      if (layout.charMode) {
        // Repinta los huecos entre celdas que las líneas atravesaron.
        ctx.fillStyle = colors.screen;
        for (let cx = 1; cx < w / 5; cx++) {
          ctx.fillRect(
            pixelLeft(layout, cx * 5) - layout.gapX,
            layout.pad,
            layout.gapX,
            layout.height - 2 * layout.pad,
          );
        }
        for (let cy = 1; cy < h / 8; cy++) {
          ctx.fillRect(
            layout.pad,
            pixelTop(layout, cy * 8) - layout.gapY,
            layout.width - 2 * layout.pad,
            layout.gapY,
          );
        }
      }
    }

    // Celdas incompatibles: contorno y aspa (no solo color).
    if (input.overflow.length > 0) {
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#e02020';
      for (const cell of input.overflow) {
        const x = pixelLeft(layout, cell.col * 5) - 1;
        const y = pixelTop(layout, cell.row * 8) - 1;
        const cw = 5 * z + 2;
        const ch = 8 * z + 2;
        ctx.strokeRect(x, y, cw, ch);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + cw, y + ch);
        ctx.moveTo(x + cw, y);
        ctx.lineTo(x, y + ch);
        ctx.stroke();
      }
    }

    // Selección: doble trazo discontinuo blanco y negro.
    if (input.selection) {
      const s = input.selection;
      const x0 = pixelLeft(layout, Math.max(0, s.x));
      const y0 = pixelTop(layout, Math.max(0, s.y));
      const x1 = pixelLeft(layout, Math.min(w - 1, s.x + s.width - 1)) + z;
      const y1 = pixelTop(layout, Math.min(h - 1, s.y + s.height - 1)) + z;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 4]);
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1);
      ctx.lineDashOffset = 4;
      ctx.strokeStyle = '#ffffff';
      ctx.strokeRect(x0 - 0.5, y0 - 0.5, x1 - x0 + 1, y1 - y0 + 1);
      ctx.setLineDash([]);
      ctx.lineDashOffset = 0;
    }

    // Cursor de teclado.
    if (input.cursor) {
      const x = pixelLeft(layout, input.cursor.x);
      const y = pixelTop(layout, input.cursor.y);
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#000000';
      ctx.strokeRect(x - 1, y - 1, z + 2, z + 2);
      ctx.lineWidth = 1;
      ctx.strokeStyle = '#ffd400';
      ctx.strokeRect(x - 2.5, y - 2.5, z + 5, z + 5);
    }
  }

  /** Recorre los bloques continuos de píxeles en pantalla (celdas o área completa). */
  private forEachBlock(
    layout: CanvasLayout,
    fn: (x: number, y: number, w: number, h: number) => void,
  ): void {
    const z = layout.zoom;
    if (layout.charMode) {
      for (let cy = 0; cy < layout.pixelHeight / 8; cy++) {
        for (let cx = 0; cx < layout.pixelWidth / 5; cx++) {
          fn(pixelLeft(layout, cx * 5), pixelTop(layout, cy * 8), 5 * z, 8 * z);
        }
      }
    } else {
      fn(layout.pad, layout.pad, layout.pixelWidth * z, layout.pixelHeight * z);
    }
  }

  /** Dibuja una capa 1:1 escalada, respetando los huecos entre celdas. */
  private drawLayer(
    ctx: CanvasRenderingContext2D,
    layout: CanvasLayout,
    layer: HTMLCanvasElement,
  ): void {
    const z = layout.zoom;
    if (layout.charMode) {
      for (let cy = 0; cy < layout.pixelHeight / 8; cy++) {
        for (let cx = 0; cx < layout.pixelWidth / 5; cx++) {
          ctx.drawImage(
            layer,
            cx * 5,
            cy * 8,
            5,
            8,
            pixelLeft(layout, cx * 5),
            pixelTop(layout, cy * 8),
            5 * z,
            8 * z,
          );
        }
      }
    } else {
      ctx.drawImage(
        layer,
        0,
        0,
        layout.pixelWidth,
        layout.pixelHeight,
        layout.pad,
        layout.pad,
        layout.pixelWidth * z,
        layout.pixelHeight * z,
      );
    }
  }

  private updateOnLayer(
    pixels: Uint8Array,
    w: number,
    h: number,
    color: string,
    dirty: DirtyRect | null,
  ): void {
    const resized = this.onLayer.width !== w || this.onLayer.height !== h || !this.onImage;
    if (resized) {
      this.onLayer.width = w;
      this.onLayer.height = h;
      this.onImage = new ImageData(w, h);
    }
    const full =
      resized || dirty === null || this.lastPixels !== pixels || this.lastOnColor !== color;
    const region = full ? { x0: 0, y0: 0, x1: w - 1, y1: h - 1 } : dirty;
    const [r, g, b] = hexToRgb(color);
    const data = this.onImage!.data;
    for (let y = region.y0; y <= region.y1; y++) {
      for (let x = region.x0; x <= region.x1; x++) {
        const i = y * w + x;
        const p = i * 4;
        if (pixels[i]) {
          data[p] = r;
          data[p + 1] = g;
          data[p + 2] = b;
          data[p + 3] = 255;
        } else {
          data[p + 3] = 0;
        }
      }
    }
    const ctx = this.onLayer.getContext('2d');
    ctx?.putImageData(
      this.onImage!,
      0,
      0,
      region.x0,
      region.y0,
      region.x1 - region.x0 + 1,
      region.y1 - region.y0 + 1,
    );
    this.lastPixels = pixels;
    this.lastOnColor = color;
  }

  private ensureOnionCanvases(layers: readonly OnionLayer[], w: number, h: number): void {
    while (this.onionCanvases.length < layers.length)
      this.onionCanvases.push(document.createElement('canvas'));
    layers.forEach((layer, i) => {
      const c = this.onionCanvases[i]!;
      const key = this.onionKeys[i];
      // Solo se regenera si cambió el fotograma o su relación.
      if (
        key &&
        key.pixels === layer.pixels &&
        key.relation === layer.relation &&
        c.width === w &&
        c.height === h
      )
        return;
      this.onionKeys[i] = { pixels: layer.pixels, relation: layer.relation };
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (!ctx) return;
      const img = new ImageData(w, h);
      const [r, g, b] = layer.relation === 'before' ? ONION_BEFORE : ONION_AFTER;
      for (let k = 0; k < layer.pixels.length; k++) {
        if (!layer.pixels[k]) continue;
        img.data[k * 4] = r;
        img.data[k * 4 + 1] = g;
        img.data[k * 4 + 2] = b;
        img.data[k * 4 + 3] = 255;
      }
      ctx.putImageData(img, 0, 0);
    });
  }

  /** Libera las superficies auxiliares. */
  dispose(): void {
    this.onLayer.width = 0;
    this.onLayer.height = 0;
    for (const c of this.onionCanvases) {
      c.width = 0;
      c.height = 0;
    }
    this.onionCanvases = [];
    this.onionKeys = [];
    this.onImage = null;
    this.lastPixels = null;
  }
}
