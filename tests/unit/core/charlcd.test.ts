import { describe, expect, it } from 'vitest';
import {
  analyzeCharacterFrame,
  extractCellGlyph,
  glyphKey,
  planCharacterAnimation,
  romGlyphMap,
} from '../../../src/core/charlcd.ts';
import { getProfile, type CharacterProfile } from '../../../src/device-profiles/index.ts';
import { HD44780_A00 } from '../../../src/device-profiles/rom/hd44780-a00.ts';

const p16x2 = getProfile('hd44780-16x2') as CharacterProfile;

/** Dibuja un glifo de 8 filas en la celda (row, col). */
function putGlyph(
  px: Uint8Array,
  width: number,
  row: number,
  col: number,
  rows: readonly number[],
) {
  for (let y = 0; y < 8; y++) {
    for (let x = 0; x < 5; x++) {
      if (rows[y]! & (0x10 >> x)) px[(row * 8 + y) * width + col * 5 + x] = 1;
    }
  }
}

/** Glifo único n-ésimo: patrón binario de n en las filas. */
const uniqueGlyph = (n: number) => [n & 31, (n >> 5) & 31, 1, 0, 0, 0, 0, 0];

describe('análisis de celdas HD44780', () => {
  it('extrae glifos con el bit 4 a la izquierda', () => {
    const px = new Uint8Array(80 * 16);
    px[(8 + 2) * 80 + 5 * 3 + 0] = 1; // fila 1, columna 3, píxel (0, 2)
    px[(8 + 7) * 80 + 5 * 3 + 4] = 1; // píxel (4, 7)
    const g = extractCellGlyph(px, 80, 1, 3);
    expect(Array.from(g)).toEqual([0, 0, 0x10, 0, 0, 0, 0, 0x01]);
  });

  it('las celdas vacías son espacios y no usan CGRAM', () => {
    const a = analyzeCharacterFrame(new Uint8Array(80 * 16), p16x2, 'none');
    expect(a.glyphs).toHaveLength(0);
    expect(Array.from(a.cellRom).every((c) => c === 0x20)).toBe(true);
    expect(a.overflow).toEqual([]);
  });

  it('comparte ranura entre celdas con el mismo dibujo', () => {
    const px = new Uint8Array(80 * 16);
    putGlyph(px, 80, 0, 0, uniqueGlyph(1));
    putGlyph(px, 80, 1, 15, uniqueGlyph(1));
    putGlyph(px, 80, 0, 5, uniqueGlyph(2));
    const a = analyzeCharacterFrame(px, p16x2, 'none');
    expect(a.glyphs).toHaveLength(2);
    expect(a.cellGlyph[0]).toBe(0);
    expect(a.cellGlyph[16 + 15]).toBe(0);
    expect(a.cellGlyph[5]).toBe(1);
  });

  it('sin ROM, un dibujo idéntico a una letra ROM sigue siendo CGRAM', () => {
    const px = new Uint8Array(80 * 16);
    putGlyph(px, 80, 0, 0, HD44780_A00.get(0x41)!);
    const none = analyzeCharacterFrame(px, p16x2, 'none');
    expect(none.glyphs).toHaveLength(1);
    const rom = analyzeCharacterFrame(px, p16x2, 'hd44780-a00');
    expect(rom.glyphs).toHaveLength(0);
    expect(rom.cellRom[0]).toBe(0x41);
  });

  it('un dibujo que difiere en un píxel de la ROM no se trata como ROM', () => {
    const px = new Uint8Array(80 * 16);
    const almostA = [...HD44780_A00.get(0x41)!];
    almostA[7] = 1;
    putGlyph(px, 80, 0, 0, almostA);
    expect(analyzeCharacterFrame(px, p16x2, 'hd44780-a00').glyphs).toHaveLength(1);
  });

  it('informa exactamente qué celdas exceden 8 caracteres CGRAM', () => {
    const px = new Uint8Array(80 * 16);
    for (let c = 0; c < 10; c++) putGlyph(px, 80, 0, c, uniqueGlyph(c + 1));
    putGlyph(px, 80, 1, 0, uniqueGlyph(1)); // repetido: cabe
    putGlyph(px, 80, 1, 1, uniqueGlyph(10)); // repetido del 10º: no cabe
    const a = analyzeCharacterFrame(px, p16x2, 'none');
    expect(a.glyphs).toHaveLength(10);
    expect(a.overflow).toEqual([
      { row: 0, col: 8 },
      { row: 0, col: 9 },
      { row: 1, col: 1 },
    ]);
  });

  it('el mapa ROM A00 no incluye el espacio y usa el código menor', () => {
    const map = romGlyphMap('hd44780-a00');
    expect([...map.values()]).not.toContain(0x20);
    expect(map.get(glyphKey(Uint8Array.from(HD44780_A00.get(0xff)!)))).toBe(0xff);
    expect(romGlyphMap('none').size).toBe(0);
    expect(romGlyphMap('hd44780-a00')).toBe(map);
  });
});

describe('plan de animación CGRAM', () => {
  const frameWith = (glyphs: number[][]) => {
    const px = new Uint8Array(80 * 16);
    glyphs.forEach((g, i) => putGlyph(px, 80, Math.floor(i / 16), i % 16, g));
    return { pixels: px };
  };

  it('asigna ranuras estables y solo recarga lo que cambia', () => {
    const f0 = frameWith([uniqueGlyph(1), uniqueGlyph(2), uniqueGlyph(3)]);
    const f1 = frameWith([uniqueGlyph(2), uniqueGlyph(4)]);
    const f2 = frameWith([uniqueGlyph(1), uniqueGlyph(2)]);
    const plan = planCharacterAnimation([f0, f1, f2], [0, 1, 2], p16x2, 'none');
    expect(plan.overflow).toEqual([]);
    expect(plan.glyphPool).toHaveLength(4);
    const [a, b, c] = plan.frames;
    expect(Array.from(a!.slots.slice(0, 3))).toEqual([0, 1, 2]);
    expect(a!.reloads).toEqual([0, 1, 2]);
    // El glifo 2 sigue en la ranura 1; el 4 ocupa una ranura nunca usada.
    expect(b!.slots[1]).toBe(1);
    expect(b!.slots[3]).toBe(3);
    expect(b!.reloads).toEqual([3]);
    expect(Array.from(b!.cells.slice(0, 2))).toEqual([1, 3]);
    expect(b!.cells[2]).toBe(0x20);
    // El glifo 1 se mantiene cargado en la ranura 0 aunque no se usó en f1.
    expect(c!.reloads).toEqual([]);
    expect(Array.from(c!.cells.slice(0, 2))).toEqual([0, 1]);
  });

  it('reutiliza ranuras de glifos que ya no se necesitan', () => {
    const frames = [
      frameWith(Array.from({ length: 8 }, (_, i) => uniqueGlyph(i + 1))),
      frameWith(Array.from({ length: 8 }, (_, i) => uniqueGlyph(i + 20))),
    ];
    const plan = planCharacterAnimation(frames, [0, 1], p16x2, 'none');
    expect(plan.frames[1]!.reloads).toEqual([0, 1, 2, 3, 4, 5, 6, 7]);
    expect(plan.glyphPool).toHaveLength(16);
    for (const f of plan.frames) {
      for (const code of f.cells) expect(code < 8 || code === 0x20).toBe(true);
    }
  });

  it('bloquea los fotogramas con más de 8 glifos', () => {
    const ok = frameWith([uniqueGlyph(1)]);
    const bad = frameWith(Array.from({ length: 9 }, (_, i) => uniqueGlyph(i + 1)));
    const plan = planCharacterAnimation([ok, bad], [0, 1], p16x2, 'none');
    expect(plan.overflow).toEqual([{ frameIndex: 1, cells: [{ row: 0, col: 8 }], glyphCount: 9 }]);
    expect(plan.frames).toHaveLength(1);
  });

  it('lanza con índices inexistentes', () => {
    expect(() => planCharacterAnimation([], [0], p16x2, 'none')).toThrow();
  });
});
