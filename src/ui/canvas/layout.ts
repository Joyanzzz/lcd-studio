import { LIMITS } from '../../core/limits.ts';
import type { DisplayProfile } from '../../device-profiles/index.ts';

/**
 * Geometría de presentación del lienzo (pura, sin DOM). En LCD de caracteres
 * añade separación entre celdas de 5×8 como en la pantalla real.
 */
export interface CanvasLayout {
  readonly zoom: number;
  readonly pad: number;
  readonly gapX: number;
  readonly gapY: number;
  readonly charMode: boolean;
  readonly pixelWidth: number;
  readonly pixelHeight: number;
  /** Tamaño del lienzo en píxeles CSS. */
  readonly width: number;
  readonly height: number;
}

export function computeLayout(
  pixelWidth: number,
  pixelHeight: number,
  profile: DisplayProfile,
  zoom: number,
): CanvasLayout {
  const z = Math.min(LIMITS.zoomMax, Math.max(LIMITS.zoomMin, Math.round(zoom)));
  const charMode = profile.kind === 'character';
  const gapX = charMode ? Math.max(2, Math.round(z * 0.6)) : 0;
  const gapY = charMode ? Math.max(3, Math.round(z)) : 0;
  const pad = Math.max(8, Math.round(z * 1.25));
  const cols = charMode ? pixelWidth / 5 : 1;
  const rows = charMode ? pixelHeight / 8 : 1;
  return {
    zoom: z,
    pad,
    gapX,
    gapY,
    charMode,
    pixelWidth,
    pixelHeight,
    width: pad * 2 + pixelWidth * z + (cols - 1) * gapX,
    height: pad * 2 + pixelHeight * z + (rows - 1) * gapY,
  };
}

export function pixelLeft(layout: CanvasLayout, x: number): number {
  return layout.pad + x * layout.zoom + (layout.charMode ? Math.floor(x / 5) * layout.gapX : 0);
}

export function pixelTop(layout: CanvasLayout, y: number): number {
  return layout.pad + y * layout.zoom + (layout.charMode ? Math.floor(y / 8) * layout.gapY : 0);
}

/** Convierte una posición en píxeles CSS a coordenadas de píxel del proyecto. */
export function screenToPixel(
  layout: CanvasLayout,
  sx: number,
  sy: number,
): { x: number; y: number; inside: boolean } {
  const u = sx - layout.pad;
  const v = sy - layout.pad;
  const z = layout.zoom;
  let x: number;
  let y: number;
  if (layout.charMode) {
    const cw = 5 * z + layout.gapX;
    const ch = 8 * z + layout.gapY;
    const cx = Math.floor(u / cw);
    const cy = Math.floor(v / ch);
    x = cx * 5 + Math.min(4, Math.max(0, Math.floor((u - cx * cw) / z)));
    y = cy * 8 + Math.min(7, Math.max(0, Math.floor((v - cy * ch) / z)));
  } else {
    x = Math.floor(u / z);
    y = Math.floor(v / z);
  }
  return { x, y, inside: x >= 0 && y >= 0 && x < layout.pixelWidth && y < layout.pixelHeight };
}

/** Mayor zoom que cabe en el espacio disponible sin superar el lado máximo del lienzo. */
export function fitZoom(
  pixelWidth: number,
  pixelHeight: number,
  profile: DisplayProfile,
  availableWidth: number,
  availableHeight: number,
  devicePixelRatio = 1,
): number {
  for (let z = LIMITS.zoomMax; z > LIMITS.zoomMin; z--) {
    const l = computeLayout(pixelWidth, pixelHeight, profile, z);
    const maxSide = LIMITS.viewMaxCanvasSide / Math.max(1, devicePixelRatio);
    if (
      l.width <= availableWidth &&
      l.height <= availableHeight &&
      l.width <= maxSide &&
      l.height <= maxSide
    ) {
      return z;
    }
  }
  return LIMITS.zoomMin;
}

/** Zoom máximo permitido por el tamaño máximo del lienzo. */
export function maxZoomFor(
  pixelWidth: number,
  pixelHeight: number,
  profile: DisplayProfile,
  devicePixelRatio = 1,
): number {
  const maxSide = LIMITS.viewMaxCanvasSide / Math.max(1, devicePixelRatio);
  for (let z = LIMITS.zoomMax; z > LIMITS.zoomMin; z--) {
    const l = computeLayout(pixelWidth, pixelHeight, profile, z);
    if (l.width <= maxSide && l.height <= maxSide) return z;
  }
  return LIMITS.zoomMin;
}
