import type { LedMatrixProfile } from './types.ts';

/**
 * Matrices de LEDs. Solo una matriz monocroma de 8×8 con un MAX7219 (64
 * LEDs reales). La orientación física del módulo y el cableado interno no
 * forman parte del perfil: se configuran en el proyecto (`device.matrix`),
 * porque cambian de un módulo a otro.
 */
export const LED_MATRIX_PROFILES: readonly LedMatrixProfile[] = Object.freeze([
  Object.freeze({
    kind: 'led-matrix',
    content: 'raster',
    id: 'max7219-8x8',
    labelKey: 'profile.max7219-8x8',
    controller: 'MAX7219',
    width: 8,
    height: 8,
    modules: 1,
  }),
]);

/**
 * Correspondencia entre la imagen (ya orientada) y los registros del MAX7219.
 * El MAX7219 tiene 8 registros de dígito (DIG0–DIG7, direcciones 1–8) de 8
 * bits. Según el módulo, cada registro gobierna una fila o una columna de
 * LEDs y el bit 7 o el bit 0 corresponde al primer LED. Ningún perfil se
 * supone universal: se comprueba con los patrones de diagnóstico.
 *
 * - `rows-msb-left`: DIGn = fila n; bit 7 = columna 0 (izquierda). Es la
 *   convención de `LedControl::setRow` en los módulos con 1088AS.
 * - `rows-lsb-left`: DIGn = fila n; bit 0 = columna 0.
 * - `cols-msb-top`: DIGn = columna n; bit 7 = fila 0 (arriba).
 * - `cols-lsb-top`: DIGn = columna n; bit 0 = fila 0.
 */
export type MatrixWiringId = 'rows-msb-left' | 'rows-lsb-left' | 'cols-msb-top' | 'cols-lsb-top';
export const MATRIX_WIRINGS: readonly MatrixWiringId[] = [
  'rows-msb-left',
  'rows-lsb-left',
  'cols-msb-top',
  'cols-lsb-top',
];

/** Giro del módulo montado (en sentido horario), independiente del dibujo. */
export type MatrixRotation = 0 | 90 | 180 | 270;
export const MATRIX_ROTATIONS: readonly MatrixRotation[] = [0, 90, 180, 270];

/** Intensidad del MAX7219 (registro 0x0A): 0–15, de 1/32 a 31/32 de ciclo. */
export const MAX7219_BRIGHTNESS_MAX = 15;
