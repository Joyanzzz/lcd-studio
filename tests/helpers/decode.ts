import { hexToRgb } from '../../src/core/appearance.ts';
import { rowStride } from '../../src/exporters/shared/packing.ts';

/** Inversa de `packRowsMsb`. */
export function unpackRowsMsb(bytes: Uint8Array, width: number, height: number): Uint8Array {
  const stride = rowStride(width);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[y * width + x] = (bytes[y * stride + (x >> 3)]! >> (7 - (x & 7))) & 1;
    }
  }
  return out;
}

/** Inversa de `packRowsLsb`. */
export function unpackRowsLsb(bytes: Uint8Array, width: number, height: number): Uint8Array {
  const stride = rowStride(width);
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[y * width + x] = (bytes[y * stride + (x >> 3)]! >> (x & 7)) & 1;
    }
  }
  return out;
}

/** Inversa de `packPages`. */
export function unpackPages(bytes: Uint8Array, width: number, height: number): Uint8Array {
  const out = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      out[y * width + x] = (bytes[(y >> 3) * width + x]! >> (y & 7)) & 1;
    }
  }
  return out;
}

/** Relación de contraste WCAG entre dos colores `#rrggbb`. */
export function contrastRatio(a: string, b: string): number {
  const la = relativeLuminance(hexToRgb(a));
  const lb = relativeLuminance(hexToRgb(b));
  const [hi, lo] = la > lb ? [la, lb] : [lb, la];
  return (hi + 0.05) / (lo + 0.05);
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const lin = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
}
