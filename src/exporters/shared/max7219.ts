import type { MatrixConfig } from '../../core/device.ts';
import type { MatrixRotation } from '../../device-profiles/index.ts';

/**
 * Datos para el MAX7219 a partir de la imagen editada (8×8, fila a fila).
 *
 * Hay dos transformaciones distintas y separadas:
 * 1. Orientación física: el módulo puede estar montado girado. La imagen del
 *    editor es la que debe VER el usuario; aquí se calcula qué tiene que
 *    mostrar el módulo en su orientación de referencia para que, girado
 *    `rotation` grados en sentido horario, se vea como en el editor. El dibujo
 *    del proyecto nunca se modifica (las transformaciones artísticas, como
 *    voltear o desplazar, son ediciones normales del dibujo).
 * 2. Cableado: cómo se reparten las filas/columnas del módulo entre los
 *    registros de dígito DIG0–DIG7 (direcciones 0x01–0x08) y qué bit
 *    corresponde a cada LED.
 */

export const MATRIX_SIZE = 8;

/**
 * Píxel del editor que debe mostrar el LED (mx, my) del módulo (coordenadas
 * de su orientación de referencia) cuando está montado con `rotation`.
 */
export function viewerPixelFor(
  mx: number,
  my: number,
  rotation: MatrixRotation,
): { x: number; y: number } {
  const n = MATRIX_SIZE - 1;
  switch (rotation) {
    case 90:
      return { x: n - my, y: mx };
    case 180:
      return { x: n - mx, y: n - my };
    case 270:
      return { x: my, y: n - mx };
    default:
      return { x: mx, y: my };
  }
}

/** Imagen en la orientación de referencia del módulo. */
export function moduleImage(pixels: Uint8Array, rotation: MatrixRotation): Uint8Array {
  if (pixels.length !== MATRIX_SIZE * MATRIX_SIZE) throw new Error('Se esperaba 8×8');
  const out = new Uint8Array(MATRIX_SIZE * MATRIX_SIZE);
  for (let my = 0; my < MATRIX_SIZE; my++) {
    for (let mx = 0; mx < MATRIX_SIZE; mx++) {
      const v = viewerPixelFor(mx, my, rotation);
      out[my * MATRIX_SIZE + mx] = pixels[v.y * MATRIX_SIZE + v.x] ? 1 : 0;
    }
  }
  return out;
}

/**
 * Los 8 bytes de registro (DIG0 → índice 0 … DIG7 → índice 7) para un
 * fotograma, aplicando la orientación física y el cableado.
 */
export function registerBytes(pixels: Uint8Array, matrix: MatrixConfig): Uint8Array {
  const m = moduleImage(pixels, matrix.rotation);
  const out = new Uint8Array(MATRIX_SIZE);
  for (let r = 0; r < MATRIX_SIZE; r++) {
    for (let c = 0; c < MATRIX_SIZE; c++) {
      if (!m[r * MATRIX_SIZE + c]) continue;
      switch (matrix.wiring) {
        case 'rows-msb-left':
          out[r] = out[r]! | (0x80 >> c);
          break;
        case 'rows-lsb-left':
          out[r] = out[r]! | (1 << c);
          break;
        case 'cols-msb-top':
          out[c] = out[c]! | (0x80 >> r);
          break;
        case 'cols-lsb-top':
          out[c] = out[c]! | (1 << r);
          break;
      }
    }
  }
  return out;
}

/** Registros de control del MAX7219 (hoja de datos de Maxim, tabla 2). */
export const MAX7219_REG = Object.freeze({
  decodeMode: 0x09,
  intensity: 0x0a,
  scanLimit: 0x0b,
  shutdown: 0x0c,
  displayTest: 0x0f,
});
