import type { Rgb } from './png.ts';

/**
 * Codificador GIF89a con LZW propio. Paleta global única, sin transparencia;
 * cada cuadro ocupa el lienzo completo y usa eliminación "no eliminar".
 */

/** Compresión LZW de GIF (códigos de longitud variable, LSB primero). */
export function lzwEncode(indices: Uint8Array, minCodeSize: number): Uint8Array {
  if (minCodeSize < 2 || minCodeSize > 8) throw new Error('Tamaño mínimo de código no válido');
  const clear = 1 << minCodeSize;
  const eoi = clear + 1;
  const out: number[] = [];
  let bitBuffer = 0;
  let bitCount = 0;
  const emit = (code: number, size: number) => {
    bitBuffer |= code << bitCount;
    bitCount += size;
    while (bitCount >= 8) {
      out.push(bitBuffer & 0xff);
      bitBuffer >>>= 8;
      bitCount -= 8;
    }
  };
  let codeSize = minCodeSize + 1;
  let next = eoi + 1;
  let dict = new Map<number, number>();
  emit(clear, codeSize);
  if (indices.length === 0) {
    emit(eoi, codeSize);
    if (bitCount > 0) out.push(bitBuffer & 0xff);
    return Uint8Array.from(out);
  }
  let prefix = indices[0]!;
  for (let i = 1; i < indices.length; i++) {
    const k = indices[i]!;
    const key = (prefix << 8) | k;
    const found = dict.get(key);
    if (found !== undefined) {
      prefix = found;
      continue;
    }
    emit(prefix, codeSize);
    if (next < 4096) {
      dict.set(key, next);
      // El decodificador amplía el código cuando la siguiente entrada lo requiere.
      if (next === 1 << codeSize && codeSize < 12) codeSize++;
      next++;
    } else {
      emit(clear, codeSize);
      dict = new Map();
      next = eoi + 1;
      codeSize = minCodeSize + 1;
    }
    prefix = k;
  }
  emit(prefix, codeSize);
  emit(eoi, codeSize);
  if (bitCount > 0) out.push(bitBuffer & 0xff);
  return Uint8Array.from(out);
}

export interface GifFrame {
  readonly indices: Uint8Array;
  /** Retardo en centésimas de segundo (2–65535). */
  readonly delayCs: number;
}

export function encodeGif(
  width: number,
  height: number,
  palette: readonly Rgb[],
  frames: readonly GifFrame[],
  repeat: boolean,
): Uint8Array {
  if (width < 1 || height < 1 || width > 0xffff || height > 0xffff) {
    throw new Error('Dimensiones GIF no válidas');
  }
  if (frames.length === 0) throw new Error('GIF sin cuadros');
  let bits = 1;
  while (1 << bits < palette.length) bits++;
  if (bits > 8) throw new Error('Paleta GIF demasiado grande');
  const tableSize = 1 << bits;
  const out: number[] = [];
  const u16 = (v: number) => out.push(v & 0xff, (v >> 8) & 0xff);
  const ascii = (s: string) => {
    for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
  };
  ascii('GIF89a');
  u16(width);
  u16(height);
  out.push(0x80 | ((bits - 1) << 4) | (bits - 1), 0, 0);
  for (let i = 0; i < tableSize; i++) {
    const c = palette[i] ?? [0, 0, 0];
    out.push(c[0], c[1], c[2]);
  }
  if (repeat) {
    out.push(0x21, 0xff, 0x0b);
    ascii('NETSCAPE2.0');
    out.push(0x03, 0x01, 0x00, 0x00, 0x00);
  }
  const minCode = Math.max(2, bits);
  const chunks: Uint8Array[] = [];
  for (const frame of frames) {
    if (frame.indices.length !== width * height) throw new Error('Cuadro GIF incoherente');
    if (!Number.isInteger(frame.delayCs) || frame.delayCs < 2 || frame.delayCs > 0xffff) {
      throw new Error('Retardo GIF no válido');
    }
    out.push(0x21, 0xf9, 0x04, 0x04);
    u16(frame.delayCs);
    out.push(0x00, 0x00);
    out.push(0x2c);
    u16(0);
    u16(0);
    u16(width);
    u16(height);
    out.push(0x00, minCode);
    const data = lzwEncode(frame.indices, minCode);
    for (let i = 0; i < data.length; i += 255) {
      const len = Math.min(255, data.length - i);
      out.push(len);
      for (let k = 0; k < len; k++) out.push(data[i + k]!);
    }
    out.push(0x00);
    // Evita que el arreglo intermedio crezca sin límite en animaciones largas.
    if (out.length > 1 << 20) {
      chunks.push(Uint8Array.from(out));
      out.length = 0;
    }
  }
  out.push(0x3b);
  chunks.push(Uint8Array.from(out));
  const total = chunks.reduce((s, c) => s + c.length, 0);
  const result = new Uint8Array(total);
  let o = 0;
  for (const c of chunks) {
    result.set(c, o);
    o += c.length;
  }
  return result;
}
