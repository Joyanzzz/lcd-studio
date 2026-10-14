/**
 * Relleno por área 4-conexo mediante tramos horizontales (scanline). Trabaja
 * sobre `pixels` en el sitio y devuelve el número de píxeles cambiados.
 */
export function floodFill(
  pixels: Uint8Array,
  width: number,
  height: number,
  startX: number,
  startY: number,
  value: 0 | 1,
): number {
  if (startX < 0 || startY < 0 || startX >= width || startY >= height) return 0;
  const target = pixels[startY * width + startX] ? 1 : 0;
  if (target === value) return 0;
  let changed = 0;
  // Pila de semillas como enteros (y * width + x) para no crear objetos.
  const stack: number[] = [startY * width + startX];
  while (stack.length > 0) {
    const seed = stack.pop()!;
    const y = Math.floor(seed / width);
    let x = seed - y * width;
    if ((pixels[y * width + x] ? 1 : 0) !== target) continue;
    while (x > 0 && (pixels[y * width + x - 1] ? 1 : 0) === target) x--;
    let spanUp = false;
    let spanDown = false;
    while (x < width && (pixels[y * width + x] ? 1 : 0) === target) {
      pixels[y * width + x] = value;
      changed++;
      if (y > 0) {
        const up = (pixels[(y - 1) * width + x] ? 1 : 0) === target;
        if (up && !spanUp) stack.push((y - 1) * width + x);
        spanUp = up;
      }
      if (y < height - 1) {
        const down = (pixels[(y + 1) * width + x] ? 1 : 0) === target;
        if (down && !spanDown) stack.push((y + 1) * width + x);
        spanDown = down;
      }
      x++;
    }
  }
  return changed;
}
