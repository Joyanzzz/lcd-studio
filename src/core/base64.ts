import { AppError } from './errors.ts';

/**
 * Base64 estándar (RFC 4648 §4) con relleno, en modo estricto.
 *
 * Se implementa aquí en lugar de usar `atob`/`btoa` porque estos aceptan
 * espacios y relleno incompleto, operan sobre cadenas "binarias" y no
 * permiten distinguir una codificación canónica de una manipulada.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const DECODE_TABLE: Int16Array = (() => {
  const table = new Int16Array(128).fill(-1);
  for (let i = 0; i < ALPHABET.length; i++) table[ALPHABET.charCodeAt(i)] = i;
  return table;
})();

export function base64Length(byteLength: number): number {
  return 4 * Math.ceil(byteLength / 3);
}

export function encodeBase64(bytes: Uint8Array): string {
  const parts: string[] = [];
  let chunk = '';
  for (let i = 0; i < bytes.length; i += 3) {
    const b0 = bytes[i]!;
    const b1 = i + 1 < bytes.length ? bytes[i + 1]! : 0;
    const b2 = i + 2 < bytes.length ? bytes[i + 2]! : 0;
    const triple = (b0 << 16) | (b1 << 8) | b2;
    chunk += ALPHABET[(triple >> 18) & 63]! + ALPHABET[(triple >> 12) & 63]!;
    chunk += i + 1 < bytes.length ? ALPHABET[(triple >> 6) & 63]! : '=';
    chunk += i + 2 < bytes.length ? ALPHABET[triple & 63]! : '=';
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  parts.push(chunk);
  return parts.join('');
}

/**
 * Decodifica base64 canónica. Rechaza caracteres fuera del alfabeto, espacios,
 * longitudes no múltiplo de 4, relleno mal colocado y bits sobrantes distintos
 * de cero (que harían que dos textos distintos dieran los mismos bytes).
 */
export function decodeBase64(text: string): Uint8Array {
  if (text.length % 4 !== 0) throw new AppError('base64.length');
  if (text.length === 0) return new Uint8Array(0);
  let padding = 0;
  if (text.endsWith('==')) padding = 2;
  else if (text.endsWith('=')) padding = 1;
  const outLength = (text.length / 4) * 3 - padding;
  const out = new Uint8Array(outLength);
  let o = 0;
  for (let i = 0; i < text.length; i += 4) {
    const last = i + 4 === text.length;
    const v: number[] = [0, 0, 0, 0];
    for (let k = 0; k < 4; k++) {
      const code = text.charCodeAt(i + k);
      if (code === 61 /* = */) {
        if (!last || k < 4 - padding) throw new AppError('base64.padding');
        v[k] = 0;
        continue;
      }
      const value = code < 128 ? DECODE_TABLE[code]! : -1;
      if (value < 0) throw new AppError('base64.character', { position: i + k });
      v[k] = value;
    }
    const triple = (v[0]! << 18) | (v[1]! << 12) | (v[2]! << 6) | v[3]!;
    out[o++] = (triple >> 16) & 255;
    if (last && padding === 2) {
      if ((triple & 0xffff) !== 0) throw new AppError('base64.nonCanonical');
      break;
    }
    out[o++] = (triple >> 8) & 255;
    if (last && padding === 1) {
      if ((triple & 0xff) !== 0) throw new AppError('base64.nonCanonical');
      break;
    }
    out[o++] = triple & 255;
  }
  return out;
}
