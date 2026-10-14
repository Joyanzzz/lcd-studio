import { zlibSync } from 'fflate';
import { crc32 } from '../../core/crc32.ts';

/**
 * Codificador PNG indexado (tipo de color 3) determinista.
 *
 * No se usa `canvas.toBlob()` porque cada navegador comprime distinto y los
 * bytes no coincidirían entre web y escritorio. La compresión zlib la hace
 * `fflate` (versión fijada), que es determinista.
 */

export type Rgb = readonly [number, number, number];

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/**
 * `indices` contiene un índice de paleta por píxel (fila a fila). Se elige la
 * menor profundidad (1, 2, 4 u 8 bits) que admite la paleta.
 */
export function encodeIndexedPng(
  width: number,
  height: number,
  indices: Uint8Array,
  palette: readonly Rgb[],
): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error('Dimensiones PNG no válidas');
  }
  if (indices.length !== width * height) throw new Error('Índices PNG incoherentes');
  if (palette.length < 1 || palette.length > 256) throw new Error('Paleta PNG no válida');
  const depth = palette.length <= 2 ? 1 : palette.length <= 4 ? 2 : palette.length <= 16 ? 4 : 8;
  const perByte = 8 / depth;
  const stride = Math.ceil(width / perByte);
  const raw = new Uint8Array((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // filtro "None"
    for (let x = 0; x < width; x++) {
      const v = indices[y * width + x]!;
      if (v >= palette.length) throw new Error('Índice fuera de la paleta');
      const shift = 8 - depth * ((x % perByte) + 1);
      raw[rowStart + 1 + Math.floor(x / perByte)]! |= v << shift;
    }
  }
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = depth;
  ihdr[9] = 3; // indexado
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;
  const plte = new Uint8Array(palette.length * 3);
  palette.forEach((c, i) => plte.set(c, i * 3));
  const idat = zlibSync(raw, { level: 9, mem: 8 });
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('PLTE', plte),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const out = new Uint8Array(parts.reduce((s, p) => s + p.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}
