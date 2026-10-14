/**
 * Empaquetados de píxeles para pantallas. `pixels` es 1 byte por píxel en
 * orden fila por fila.
 */

/** Bytes por fila con empaquetado horizontal. */
export function rowStride(width: number): number {
  return (width + 7) >> 3;
}

/**
 * Filas, MSB primero (Adafruit_GFX `drawBitmap`): el bit 7 del primer byte es
 * el píxel de la izquierda. Cada fila empieza en un byte nuevo; los bits
 * sobrantes al final de la fila son 0.
 */
export function packRowsMsb(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const stride = rowStride(width);
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x]) out[y * stride + (x >> 3)]! |= 0x80 >> (x & 7);
    }
  }
  return out;
}

/**
 * Filas, LSB primero (XBM / U8g2 `drawXBM`): el bit 0 del primer byte es el
 * píxel de la izquierda.
 */
export function packRowsLsb(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const stride = rowStride(width);
  const out = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x]) out[y * stride + (x >> 3)]! |= 1 << (x & 7);
    }
  }
  return out;
}

/** Número de páginas de 8 filas. */
export function pageCount(height: number): number {
  return (height + 7) >> 3;
}

/**
 * Páginas verticales (memoria de SSD1306, PCD8544 y KS0108): cada byte son 8
 * píxeles de una columna, bit 0 arriba. Orden: página 0 de izquierda a
 * derecha, luego página 1… La última página se rellena con 0 si la altura no
 * es múltiplo de 8.
 */
export function packPages(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const pages = pageCount(height);
  const out = new Uint8Array(pages * width);
  for (let y = 0; y < height; y++) {
    const page = y >> 3;
    const bit = 1 << (y & 7);
    for (let x = 0; x < width; x++) {
      if (pixels[y * width + x]) out[page * width + x]! |= bit;
    }
  }
  return out;
}
