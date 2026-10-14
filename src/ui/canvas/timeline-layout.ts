/**
 * Tamaño de las miniaturas de la línea de tiempo (puro, sin DOM).
 *
 * Todas las miniaturas tienen el mismo tamaño: su anchura NO representa la
 * duración. Se conserva la proporción del lienzo y nunca se baja de una
 * anchura mínima legible; si no caben, la tira se desplaza horizontalmente.
 */

/** Altura máxima de la miniatura (px CSS) para cada nivel de zoom. */
export const TIMELINE_ZOOM_HEIGHTS: readonly number[] = [24, 32, 44, 60, 80];
export const TIMELINE_ZOOM_DEFAULT = 2;
/** Anchura mínima legible de una miniatura. */
export const THUMB_MIN_WIDTH = 36;
/** Anchura máxima de una miniatura (pantallas muy anchas, p. ej. 20×2). */
export const THUMB_MAX_WIDTH = 220;
/** Espacio horizontal que ocupa cada elemento además de la miniatura (bordes, relleno, separación). */
export const ITEM_CHROME = 12;

export interface ThumbSize {
  readonly width: number;
  readonly height: number;
  /** Verdadero si con este tamaño caben todos los fotogramas sin desplazarse. */
  readonly fitsAll: boolean;
}

export function clampZoom(zoom: number): number {
  return Math.min(TIMELINE_ZOOM_HEIGHTS.length - 1, Math.max(0, Math.round(zoom) || 0));
}

/**
 * @param canvasWidth  anchura del lienzo del proyecto en píxeles
 * @param canvasHeight altura del lienzo del proyecto en píxeles
 * @param zoom         nivel 0–4 (altura máxima)
 * @param fit          ajustar para que quepan tantos fotogramas como sea posible
 * @param available    anchura disponible de la tira (px CSS)
 * @param count        número de fotogramas
 */
export function thumbSize(
  canvasWidth: number,
  canvasHeight: number,
  zoom: number,
  fit: boolean,
  available: number,
  count: number,
): ThumbSize {
  const aspect = canvasWidth / canvasHeight;
  const maxH = TIMELINE_ZOOM_HEIGHTS[clampZoom(zoom)]!;
  // Tamaño natural para el zoom elegido, con la proporción del lienzo.
  let width = Math.min(THUMB_MAX_WIDTH, maxH * aspect);
  if (fit && count > 0 && available > 0) {
    const perItem = Math.floor(available / count) - ITEM_CHROME;
    width = Math.min(width, Math.max(THUMB_MIN_WIDTH, perItem));
  }
  width = Math.max(THUMB_MIN_WIDTH, Math.round(width));
  // Lienzos muy altos: la caja se limita y la imagen se dibuja centrada con su proporción.
  const height = Math.min(3 * maxH, Math.max(4, Math.round(width / aspect)));
  return { width, height, fitsAll: count * (width + ITEM_CHROME) <= available };
}
