import { describe, expect, it } from 'vitest';
import { fitFrameToCgram, fitProjectToCgram } from '../../../src/core/cgram-fit.ts';
import { analyzeCharacterFrame, freeGlyphs } from '../../../src/core/charlcd.ts';
import { createFrame, insertFrames } from '../../../src/core/project.ts';
import { getProfile, type CharacterProfile } from '../../../src/device-profiles/index.ts';
import { a00GlyphRows7 } from '../../../src/device-profiles/rom/hd44780-a00.ts';
import { charPixels, makeProject } from '../../helpers/projects.ts';

const profile = getProfile('hd44780-16x2') as CharacterProfile;
const big = getProfile('hd44780-20x4') as CharacterProfile;

/** Glifo de un solo píxel (25 posibles en el área 5×5). */
function dot(i: number): number[] {
  const rows = new Array<number>(8).fill(0);
  rows[Math.floor(i / 5)] = 0x10 >> (i % 5);
  return rows;
}

/** Glifos densos y distintos entre sí (alejados del espacio y de la ROM). */
function dense(k: number): number[] {
  return Array.from({ length: 8 }, (_, y) => ((k * 2654435761 + y * 40503 + 12345) >>> 7) & 0x1f);
}

function cells(glyphs: readonly (readonly number[])[], columns = 16): Record<string, number[]> {
  return Object.fromEntries(
    glyphs.map((g, i) => [`${Math.floor(i / columns)},${i % columns}`, [...g]]),
  );
}

function hamming(a: Uint8Array, b: Uint8Array): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) d++;
  return d;
}

describe('ajuste a 8 caracteres propios', () => {
  it('no hace nada si el fotograma ya cabe', () => {
    const px = charPixels(16, 2, cells(Array.from({ length: 8 }, (_, i) => dot(i))));
    expect(fitFrameToCgram(px, profile, 'none')).toBeUndefined();
  });

  it('deja como mucho 8 glifos y descarta primero lo que menos aporta', () => {
    const px = charPixels(16, 2, cells(Array.from({ length: 12 }, (_, i) => dot(i))));
    const before = px.slice();
    const fit = fitFrameToCgram(px, profile, 'none', 3)!;
    expect(px).toEqual(before);
    expect(fit.frameIndex).toBe(3);
    expect(fit.glyphsBefore).toBe(12);
    expect(fit.glyphsAfter).toBe(8);
    // Cada glifo sobrante es de un píxel: lo más barato es dejarlo en blanco.
    expect(fit.changedCells).toHaveLength(4);
    expect(fit.changedPixels).toBe(4);
    expect(hamming(px, fit.pixels)).toBe(4);
    expect(analyzeCharacterFrame(fit.pixels, profile, 'none').overflow).toEqual([]);
  });

  it('cambia un glifo casi idéntico por su vecino y respeta el peso de las repeticiones', () => {
    const a = dense(1);
    const variant = [...a];
    variant[0] = a[0]! ^ 0x10;
    const others = [2, 3, 4, 5, 6, 7, 8].map(dense);
    const layout = [a, a, a, a, a, variant, ...others];
    const px = charPixels(16, 2, cells(layout));
    const fit = fitFrameToCgram(px, profile, 'none')!;
    expect(fit.changedCells).toEqual([{ row: 0, col: 5 }]);
    expect(fit.changedPixels).toBe(1);
    expect(fit.glyphsAfter).toBe(8);
  });

  it('no toca las celdas que no cambian y es determinista e idempotente', () => {
    const glyphs = Array.from({ length: 30 }, (_, i) => dense(i + 1));
    const px = charPixels(16, 2, cells(glyphs));
    const first = fitFrameToCgram(px, profile, 'none')!;
    const second = fitFrameToCgram(px, profile, 'none')!;
    expect(second).toEqual(first);
    expect(first.glyphsAfter).toBeLessThanOrEqual(8);
    const changed = new Set(first.changedCells.map((c) => c.row * 16 + c.col));
    for (let cell = 0; cell < 32; cell++) {
      if (changed.has(cell)) continue;
      const row = Math.floor(cell / 16);
      const col = cell % 16;
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 5; x++) {
          const i = (row * 8 + y) * 80 + col * 5 + x;
          expect(first.pixels[i]).toBe(px[i]);
        }
      }
    }
    expect(hamming(px, first.pixels)).toBe(first.changedPixels);
    expect(fitFrameToCgram(first.pixels, profile, 'none')).toBeUndefined();
  });

  it('con la ROM A00 conserva las letras y acerca los glifos a una letra exacta', () => {
    const letterA = [...a00GlyphRows7(0x41)!, 0];
    const almostA = [...letterA];
    almostA[7] = 0b00100;
    const layout = [
      letterA,
      [...a00GlyphRows7(0x42)!, 0],
      almostA,
      ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map(dense),
    ];
    const px = charPixels(16, 2, cells(layout));
    expect(analyzeCharacterFrame(px, profile, 'hd44780-a00').glyphs.length).toBe(10);
    const fit = fitFrameToCgram(px, profile, 'hd44780-a00')!;
    const after = analyzeCharacterFrame(fit.pixels, profile, 'hd44780-a00');
    expect(after.cellRom[0]).toBe(0x41);
    expect(after.cellRom[1]).toBe(0x42);
    expect(after.cellRom[2]).toBe(0x41);
    expect(fit.changedCells).toContainEqual({ row: 0, col: 2 });
    expect(fit.glyphsAfter).toBeLessThanOrEqual(8);
    // Sin ROM, esas letras serían glifos propios y compiten por las ranuras.
    expect(analyzeCharacterFrame(px, profile, 'none').glyphs.length).toBe(12);
  });

  it('funciona en 20×4 con todas las celdas distintas', () => {
    const glyphs = Array.from({ length: 80 }, (_, i) => dense(i + 1));
    const px = charPixels(20, 4, cells(glyphs, 20));
    const fit = fitFrameToCgram(px, big, 'none')!;
    expect(fit.glyphsBefore).toBe(80);
    expect(fit.glyphsAfter).toBeLessThanOrEqual(8);
    expect(fit.changedCells.length).toBeGreaterThanOrEqual(72);
    expect(hamming(px, fit.pixels)).toBe(fit.changedPixels);
  });

  it('el conjunto de glifos libres incluye el espacio y, con ROM, sus letras', () => {
    expect(freeGlyphs('none')).toHaveLength(1);
    expect(freeGlyphs('none')[0]).toEqual(new Uint8Array(8));
    expect(freeGlyphs('hd44780-a00').length).toBeGreaterThan(90);
    expect(freeGlyphs('hd44780-a00')).toBe(freeGlyphs('hd44780-a00'));
  });
});

describe('ajuste de un proyecto', () => {
  const over = charPixels(16, 2, cells(Array.from({ length: 12 }, (_, i) => dot(i))));
  const fits = charPixels(16, 2, cells([dot(0), dot(1)]));

  it('solo devuelve los fotogramas que no caben, según el ámbito', () => {
    let p = makeProject('hd44780-16x2', [{ pixels: fits }, { pixels: over }]);
    p = insertFrames(p, 2, [createFrame(over.slice(), 200)]);
    expect(fitProjectToCgram(p, 'current', 0)).toEqual([]);
    expect(fitProjectToCgram(p, 'current', 1).map((f) => f.frameIndex)).toEqual([1]);
    expect(fitProjectToCgram(p, 'all', 0).map((f) => f.frameIndex)).toEqual([1, 2]);
  });

  it('no hace nada en pantallas gráficas', () => {
    const g = makeProject('ssd1306-128x64', [{ pixels: new Uint8Array(128 * 64).fill(1) }]);
    expect(fitProjectToCgram(g, 'all', 0)).toEqual([]);
  });
});
