/**
 * Transformaciones de fotograma completo. Todas devuelven un arreglo nuevo y
 * no modifican la entrada.
 */

export function invertPixels(pixels: Uint8Array): Uint8Array {
  const out = new Uint8Array(pixels.length);
  for (let i = 0; i < pixels.length; i++) out[i] = pixels[i] ? 0 : 1;
  return out;
}

export function clearPixels(pixels: Uint8Array): Uint8Array {
  return new Uint8Array(pixels.length);
}

/** Voltea izquierda ↔ derecha. */
export function flipHorizontal(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y++) {
    const row = y * width;
    for (let x = 0; x < width; x++) out[row + x] = pixels[row + width - 1 - x]!;
  }
  return out;
}

/** Voltea arriba ↔ abajo. */
export function flipVertical(pixels: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y++) {
    out.set(pixels.subarray((height - 1 - y) * width, (height - y) * width), y * width);
  }
  return out;
}

/** Desplaza el contenido; con `wrap` lo que sale por un borde entra por el opuesto. */
export function shiftPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  dx: number,
  dy: number,
  wrap: boolean,
): Uint8Array {
  const out = new Uint8Array(pixels.length);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let nx = x + dx;
      let ny = y + dy;
      if (wrap) {
        nx = ((nx % width) + width) % width;
        ny = ((ny % height) + height) % height;
      } else if (nx < 0 || ny < 0 || nx >= width || ny >= height) {
        continue;
      }
      out[ny * width + nx] = pixels[y * width + x]!;
    }
  }
  return out;
}
