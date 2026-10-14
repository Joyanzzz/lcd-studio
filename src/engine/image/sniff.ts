import { AppError } from '../../core/errors.ts';
import { assertDecodedImageSize, LIMITS } from '../../core/limits.ts';

/**
 * Identificación de imágenes por su firma (no por la extensión ni el tipo MIME
 * declarado) y lectura de dimensiones desde la cabecera, antes de decodificar.
 */

export type ImageFormat = 'png' | 'jpeg' | 'webp' | 'gif';

export interface ImageHeader {
  readonly format: ImageFormat;
  readonly width: number;
  readonly height: number;
  /** WebP con animación: solo se importará el primer cuadro. */
  readonly animatedWebp: boolean;
}

const ascii = (bytes: Uint8Array, offset: number, length: number): string => {
  let s = '';
  for (let i = 0; i < length; i++) s += String.fromCharCode(bytes[offset + i] ?? 0);
  return s;
};

const u16be = (b: Uint8Array, o: number) => ((b[o] ?? 0) << 8) | (b[o + 1] ?? 0);
const u16le = (b: Uint8Array, o: number) => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, o: number) =>
  (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8) | ((b[o + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, o: number) =>
  (((b[o] ?? 0) << 24) >>> 0) +
  (((b[o + 1] ?? 0) << 16) | ((b[o + 2] ?? 0) << 8) | (b[o + 3] ?? 0));

export function detectFormat(bytes: Uint8Array): ImageFormat | undefined {
  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    ascii(bytes, 1, 3) === 'PNG' &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'png';
  }
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'jpeg';
  }
  if (bytes.length >= 6 && (ascii(bytes, 0, 6) === 'GIF87a' || ascii(bytes, 0, 6) === 'GIF89a')) {
    return 'gif';
  }
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'webp';
  }
  return undefined;
}

function pngSize(b: Uint8Array): [number, number] {
  if (b.length < 24 || ascii(b, 12, 4) !== 'IHDR') throw new AppError('image.corrupt');
  return [u32be(b, 16), u32be(b, 20)];
}

function gifSize(b: Uint8Array): [number, number] {
  if (b.length < 10) throw new AppError('image.corrupt');
  return [u16le(b, 6), u16le(b, 8)];
}

function jpegSize(b: Uint8Array): [number, number] {
  let p = 2;
  while (p + 4 <= b.length) {
    if (b[p] !== 0xff) throw new AppError('image.corrupt');
    let marker = b[p + 1]!;
    while (marker === 0xff && p + 2 < b.length) {
      p++;
      marker = b[p + 1]!;
    }
    p += 2;
    if (marker === 0xd8 || (marker >= 0xd0 && marker <= 0xd7) || marker === 0x01) continue;
    if (marker === 0xd9 || marker === 0xda) break;
    const length = u16be(b, p);
    if (length < 2 || p + length > b.length) throw new AppError('image.corrupt');
    const isSof =
      marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (isSof) {
      if (length < 7) throw new AppError('image.corrupt');
      return [u16be(b, p + 5), u16be(b, p + 3)];
    }
    p += length;
  }
  throw new AppError('image.corrupt');
}

function webpSize(b: Uint8Array): [number, number, boolean] {
  if (b.length < 30) throw new AppError('image.corrupt');
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') {
    const animated = ((b[20] ?? 0) & 0x02) !== 0;
    return [u24le(b, 24) + 1, u24le(b, 27) + 1, animated];
  }
  if (chunk === 'VP8L') {
    if (b[20] !== 0x2f) throw new AppError('image.corrupt');
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24);
    return [(bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1, false];
  }
  if (chunk === 'VP8 ') {
    if (b[23] !== 0x9d || b[24] !== 0x01 || b[25] !== 0x2a) throw new AppError('image.corrupt');
    return [u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff, false];
  }
  throw new AppError('image.corrupt');
}

/**
 * Lee formato y dimensiones y aplica los límites de tamaño comprimido y
 * decodificado. Lanza `AppError` si el archivo no es admitido o los excede.
 */
export function readImageHeader(bytes: Uint8Array): ImageHeader {
  if (bytes.length > LIMITS.imageMaxCompressedBytes) {
    throw new AppError('image.tooLarge', { max: LIMITS.imageMaxCompressedBytes });
  }
  const format = detectFormat(bytes);
  if (!format) throw new AppError('image.unsupported');
  let width: number;
  let height: number;
  let animatedWebp = false;
  switch (format) {
    case 'png':
      [width, height] = pngSize(bytes);
      break;
    case 'gif':
      [width, height] = gifSize(bytes);
      break;
    case 'jpeg':
      [width, height] = jpegSize(bytes);
      break;
    case 'webp':
      [width, height, animatedWebp] = webpSize(bytes);
      break;
  }
  if (width < 1 || height < 1) throw new AppError('image.corrupt');
  assertDecodedImageSize(width, height);
  return { format, width, height, animatedWebp };
}
