import { a00GlyphRows7 } from '../device-profiles/rom/hd44780-a00.ts';
import type { DrawSurface } from './draw.ts';

/**
 * Fuente 5×7 del sello de texto (ASCII imprimible 0x20–0x7E).
 *
 * Coincide con la tabla ROM A00 en los códigos comunes para que, si el
 * usuario activa esa ROM, el texto pueda enviarse como caracteres ROM. La
 * barra invertida y la tilde se dibujan con su forma ASCII (en la ROM A00 esos
 * códigos son ¥ y →, así que nunca coincidirán y se tratarán como CGRAM).
 */

const ASCII_OVERRIDES: Readonly<Record<number, string>> = {
  0x5c: '00000 10000 01000 00100 00010 00001 00000',
  0x7e: '00000 00000 01000 10101 00010 00000 00000',
};

const FONT = new Map<number, readonly number[]>();
for (let code = 0x20; code <= 0x7e; code++) {
  const override = ASCII_OVERRIDES[code];
  const rows = override
    ? override.split(' ').map((b) => Number.parseInt(b, 2))
    : a00GlyphRows7(code);
  if (!rows) throw new Error(`Falta el glifo 0x${code.toString(16)}`);
  FONT.set(code, rows);
}

export const GLYPH_WIDTH = 5;
export const GLYPH_HEIGHT = 7;

export function isSupportedTextChar(ch: string): boolean {
  const code = ch.codePointAt(0)!;
  return ch.length === 1 && FONT.has(code);
}

/** Caracteres de `text` que la fuente no puede dibujar (sin repetir). */
export function unsupportedTextChars(text: string): string[] {
  const out: string[] = [];
  for (const ch of text) if (!isSupportedTextChar(ch) && !out.includes(ch)) out.push(ch);
  return out;
}

export function glyphRows(code: number): readonly number[] | undefined {
  return FONT.get(code);
}

export interface TextOptions {
  /** Factor de escala entero (1–4). */
  readonly scale: number;
  /** Avance horizontal por carácter en píxeles sin escalar (5 o 6). */
  readonly advance: number;
}

/**
 * Dibuja `text` con la esquina superior izquierda en (x, y). Lanza si el
 * texto contiene caracteres no admitidos (la interfaz los valida antes).
 */
export function drawText(
  surface: DrawSurface,
  x: number,
  y: number,
  text: string,
  options: TextOptions,
  value: 0 | 1,
): void {
  const bad = unsupportedTextChars(text);
  if (bad.length > 0) throw new Error(`Caracteres no admitidos: ${bad.join('')}`);
  const { scale, advance } = options;
  let cx = x;
  for (const ch of text) {
    const rows = FONT.get(ch.codePointAt(0)!)!;
    for (let r = 0; r < GLYPH_HEIGHT; r++) {
      const bits = rows[r]!;
      for (let c = 0; c < GLYPH_WIDTH; c++) {
        if (!(bits & (0x10 >> c))) continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            surface.plot(cx + c * scale + sx, y + r * scale + sy, value);
          }
        }
      }
    }
    cx += advance * scale;
  }
}
