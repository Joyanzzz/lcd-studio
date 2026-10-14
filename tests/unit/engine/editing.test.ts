import { describe, expect, it } from 'vitest';
import { DrawSurface } from '../../../src/engine/draw.ts';
import {
  clipRect,
  extractRegion,
  fillRegion,
  moveRegion,
  rectContains,
  rectFromPoints,
  stampClip,
} from '../../../src/engine/selection.ts';
import {
  drawText,
  glyphRows,
  isSupportedTextChar,
  unsupportedTextChars,
} from '../../../src/engine/text.ts';
import {
  clearPixels,
  flipHorizontal,
  flipVertical,
  invertPixels,
  shiftPixels,
} from '../../../src/engine/transform.ts';
import { fromAscii, toAscii } from '../../helpers/bitmap.ts';

const src = fromAscii(['#..', '.#.', '..#', '##.']);

describe('transformaciones', () => {
  it('invierte y limpia sin modificar la entrada', () => {
    const copy = src.pixels.slice();
    expect(toAscii(invertPixels(src.pixels), 3, 4)).toEqual(['.##', '#.#', '##.', '..#']);
    expect(Array.from(clearPixels(src.pixels))).toEqual(new Array(12).fill(0));
    expect(src.pixels).toEqual(copy);
  });

  it('voltea horizontal y verticalmente', () => {
    expect(toAscii(flipHorizontal(src.pixels, 3, 4), 3, 4)).toEqual(['..#', '.#.', '#..', '.##']);
    expect(toAscii(flipVertical(src.pixels, 3, 4), 3, 4)).toEqual(['##.', '..#', '.#.', '#..']);
    expect(flipHorizontal(flipHorizontal(src.pixels, 3, 4), 3, 4)).toEqual(src.pixels);
  });

  it('desplaza con y sin envolver', () => {
    expect(toAscii(shiftPixels(src.pixels, 3, 4, 1, 0, false), 3, 4)).toEqual([
      '.#.',
      '..#',
      '...',
      '.##',
    ]);
    expect(toAscii(shiftPixels(src.pixels, 3, 4, 1, 0, true), 3, 4)).toEqual([
      '.#.',
      '..#',
      '#..',
      '.##',
    ]);
    expect(toAscii(shiftPixels(src.pixels, 3, 4, 0, -1, true), 3, 4)).toEqual([
      '.#.',
      '..#',
      '##.',
      '#..',
    ]);
    expect(shiftPixels(src.pixels, 3, 4, -7, 9, true)).toEqual(
      shiftPixels(src.pixels, 3, 4, -1, 1, true),
    );
  });
});

describe('selección', () => {
  it('normaliza y recorta rectángulos', () => {
    expect(rectFromPoints({ x: 3, y: 1 }, { x: 0, y: 2 })).toEqual({
      x: 0,
      y: 1,
      width: 4,
      height: 2,
    });
    expect(clipRect({ x: -2, y: -2, width: 4, height: 4 }, 3, 3)).toEqual({
      x: 0,
      y: 0,
      width: 2,
      height: 2,
    });
    expect(clipRect({ x: 5, y: 0, width: 2, height: 2 }, 3, 3)).toBeUndefined();
    expect(rectContains({ x: 1, y: 1, width: 2, height: 2 }, { x: 2, y: 2 })).toBe(true);
    expect(rectContains({ x: 1, y: 1, width: 2, height: 2 }, { x: 3, y: 2 })).toBe(false);
  });

  it('copia, borra y estampa regiones', () => {
    const clip = extractRegion(src.pixels, 3, 4, { x: 1, y: 2, width: 3, height: 3 });
    expect(toAscii(clip.data, 3, 3)).toEqual(['.#.', '#..', '...']);
    const px = src.pixels.slice();
    fillRegion(px, 3, 4, { x: 0, y: 0, width: 2, height: 2 }, 0);
    expect(toAscii(px, 3, 4)).toEqual(['...', '...', '..#', '##.']);
    fillRegion(px, 3, 4, { x: 9, y: 9, width: 2, height: 2 }, 1);
    stampClip(px, 3, 4, { width: 2, height: 1, data: Uint8Array.from([1, 0]) }, 2, 0);
    expect(toAscii(px, 3, 4)[0]).toBe('..#');
    stampClip(px, 3, 4, { width: 2, height: 1, data: Uint8Array.from([0, 1]) }, 1, 3, 'or');
    expect(toAscii(px, 3, 4)[3]).toBe('###');
    stampClip(px, 3, 4, { width: 1, height: 1, data: Uint8Array.from([1]) }, -1, -1);
  });

  it('mueve o copia una región', () => {
    const moved = moveRegion(src.pixels, 3, 4, { x: 0, y: 0, width: 1, height: 1 }, 2, 0, false);
    expect(toAscii(moved, 3, 4)[0]).toBe('..#');
    const copied = moveRegion(src.pixels, 3, 4, { x: 0, y: 0, width: 1, height: 1 }, 2, 0, true);
    expect(toAscii(copied, 3, 4)[0]).toBe('#.#');
  });
});

describe('texto', () => {
  it('dibuja con la fuente 5×7 y escala', () => {
    const s = new DrawSurface(6, 7, new Uint8Array(42));
    drawText(s, 0, 0, 'A', { scale: 1, advance: 6 }, 1);
    expect(toAscii(s.pixels, 6, 7)).toEqual([
      '.###..',
      '#...#.',
      '#...#.',
      '#...#.',
      '#####.',
      '#...#.',
      '#...#.',
    ]);
    const big = new DrawSurface(10, 14, new Uint8Array(140));
    drawText(big, 0, 0, 'I', { scale: 2, advance: 5 }, 1);
    expect(toAscii(big.pixels, 10, 14)[0]).toBe('..######..');
  });

  it('valida caracteres', () => {
    expect(unsupportedTextChars('Hola ñ €ñ')).toEqual(['ñ', '€']);
    expect(isSupportedTextChar('~')).toBe(true);
    expect(isSupportedTextChar('😀')).toBe(false);
    expect(glyphRows(0x5c)).toEqual([0, 16, 8, 4, 2, 1, 0]);
    const s = new DrawSurface(5, 7, new Uint8Array(35));
    expect(() => drawText(s, 0, 0, 'ñ', { scale: 1, advance: 6 }, 1)).toThrow();
  });
});
