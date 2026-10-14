import { describe, expect, it } from 'vitest';
import { analyzeCharacterFrame } from '../../../src/core/charlcd.ts';
import {
  overLimitFrames,
  patternUses,
  unavailableCells,
  validateTransition,
} from '../../../src/core/constraints.ts';
import { propagateSharedEdits, stampPattern } from '../../../src/core/pattern-edit.ts';
import {
  createFrame,
  duplicateFrame,
  insertFrames,
  replaceFramePixels,
  setRomCharset,
} from '../../../src/core/project.ts';
import { getProfile, type CharacterProfile } from '../../../src/device-profiles/index.ts';
import { a00GlyphRows7 } from '../../../src/device-profiles/rom/hd44780-a00.ts';
import { charPixels, makeProject } from '../../helpers/projects.ts';

const profile = getProfile('hd44780-16x2') as CharacterProfile;

/** Glifo de un solo píxel en la posición i (0–24). */
function dot(i: number): number[] {
  const rows = new Array<number>(8).fill(0);
  rows[Math.floor(i / 5)] = 0x10 >> (i % 5);
  return rows;
}

/** Celdas 0..n-1 de la primera fila con glifos distintos. */
function distinct(n: number, extra: Record<string, number[]> = {}): Uint8Array {
  const cells: Record<string, number[]> = { ...extra };
  for (let i = 0; i < n; i++) cells[`${i < 16 ? 0 : 1},${i % 16}`] = dot(i);
  return charPixels(16, 2, cells);
}

describe('restricción de 8 patrones propios', () => {
  it('8 patrones distintos se aceptan y repetir uno existente en otra celda también', () => {
    const p = makeProject('hd44780-16x2', [{ pixels: new Uint8Array(80 * 16) }]);
    const eight = replaceFramePixels(p, 0, distinct(8));
    expect(validateTransition(p, eight)).toBeNull();
    // Repetir el patrón 3 en la fila 2 no añade patrones.
    const repeated = replaceFramePixels(eight, 0, distinct(8, { '1,10': dot(3), '1,11': dot(0) }));
    expect(validateTransition(eight, repeated)).toBeNull();
    expect(analyzeCharacterFrame(repeated.frames[0]!.pixels, profile, 'none').glyphs).toHaveLength(
      8,
    );
  });

  it('un noveno patrón se rechaza y la infracción indica fotograma y cantidades', () => {
    const p = makeProject('hd44780-16x2', [{ pixels: distinct(8) }]);
    const nine = replaceFramePixels(p, 0, distinct(9));
    expect(validateTransition(p, nine)).toEqual({
      code: 'cgram.limit',
      frameIndex: 0,
      glyphs: 9,
      previous: 8,
      max: 8,
    });
  });

  it('el espacio y los glifos de la ROM elegida no consumen ranura', () => {
    const a = [...a00GlyphRows7('A'.charCodeAt(0))!, 0];
    const p = makeProject('hd44780-16x2', [{ pixels: distinct(8) }]);
    const withRom = setRomCharset(p, 'hd44780-a00');
    const next = replaceFramePixels(withRom, 0, distinct(8, { '1,0': a, '1,1': a, '1,2': a }));
    expect(validateTransition(withRom, next)).toBeNull();
    // Sin ROM, la «A» sería un noveno patrón.
    const noRom = replaceFramePixels(p, 0, distinct(8, { '1,0': a }));
    expect(validateTransition(p, noRom)).not.toBeNull();
  });

  it('quitar la ROM que hacía caber el fotograma también se valida', () => {
    const a = [...a00GlyphRows7('B'.charCodeAt(0))!, 0];
    const base = makeProject('hd44780-16x2', [{ pixels: distinct(8, { '1,0': a }) }]);
    const withRom = setRomCharset(base, 'hd44780-a00');
    expect(validateTransition(withRom, setRomCharset(withRom, 'none'))).toMatchObject({
      glyphs: 9,
    });
  });

  it('los fotogramas nuevos deben cumplir el límite aunque el original estuviera en reparación', () => {
    const p = makeProject('hd44780-16x2', [{ pixels: distinct(10) }]);
    expect(overLimitFrames(p)).toEqual([0]);
    expect(validateTransition(p, duplicateFrame(p, 0))).toMatchObject({ frameIndex: 1 });
    const inserted = insertFrames(p, 1, [createFrame(distinct(9), 200)]);
    expect(validateTransition(p, inserted)).toMatchObject({ frameIndex: 1, previous: 0 });
  });

  it('en reparación se permite mantener o reducir los patrones, nunca aumentarlos', () => {
    const p = makeProject('hd44780-16x2', [{ pixels: distinct(10) }]);
    // Cambiar un patrón por otro nuevo mantiene 10: permitido.
    const same = replaceFramePixels(p, 0, distinct(9, { '0,9': dot(20) }));
    expect(validateTransition(p, same)).toBeNull();
    // Reducir a 9: permitido.
    expect(validateTransition(p, replaceFramePixels(p, 0, distinct(9)))).toBeNull();
    // Aumentar a 11: rechazado.
    expect(validateTransition(p, replaceFramePixels(p, 0, distinct(11)))).toMatchObject({
      glyphs: 11,
      previous: 10,
    });
  });

  it('no afecta a pantallas gráficas', () => {
    const p = makeProject('graphic-custom', [{ pixels: new Uint8Array(100 * 32) }], {
      width: 100,
      height: 32,
    });
    const full = replaceFramePixels(
      p,
      0,
      new Uint8Array(100 * 32).map((_, i) => i % 3),
    );
    expect(validateTransition(p, full)).toBeNull();
    expect(overLimitFrames(full)).toEqual([]);
  });
});

describe('celdas no disponibles', () => {
  it('con menos de 8 patrones no hay celdas no disponibles', () => {
    const a = analyzeCharacterFrame(distinct(7), profile, 'none');
    expect(unavailableCells(a, 'copy').every((v) => v === 0)).toBe(true);
  });

  it('con 8 patrones: vacías y compartidas (en modo copia) no disponibles; únicas sí', () => {
    const px = distinct(8, { '1,5': dot(2) });
    const a = analyzeCharacterFrame(px, profile, 'none');
    expect(patternUses(a)).toEqual([1, 1, 2, 1, 1, 1, 1, 1]);
    const copy = unavailableCells(a, 'copy');
    expect(copy[0]).toBe(0); // patrón único
    expect(copy[2]).toBe(1); // compartido con (1,5)
    expect(copy[16 + 5]).toBe(1);
    expect(copy[10]).toBe(1); // vacía
    const global = unavailableCells(a, 'global');
    expect(global[2]).toBe(0);
    expect(global[10]).toBe(1);
  });
});

describe('edición de patrones compartidos', () => {
  it('global aplica el mismo cambio a todas las apariciones; copia solo a la editada', () => {
    const base = charPixels(16, 2, { '0,0': dot(0), '0,3': dot(0), '1,7': dot(0), '0,1': dot(1) });
    const edited = base.slice();
    edited[0 * 80 + 0 * 5 + 1] = 1; // segundo píxel de la celda (0,0)
    const global = propagateSharedEdits(base, edited, profile, 'none');
    const g = analyzeCharacterFrame(global, profile, 'none');
    expect(g.glyphs).toHaveLength(2);
    expect(g.cellGlyph[3]).toBe(g.cellGlyph[0]);
    expect(g.cellGlyph[16 + 7]).toBe(g.cellGlyph[0]);
    // Sin propagar (copia): el patrón editado es uno más.
    expect(analyzeCharacterFrame(edited, profile, 'none').glyphs).toHaveLength(3);
  });

  it('si dos apariciones se editan distinto no se propaga ese patrón', () => {
    const base = charPixels(16, 2, { '0,0': dot(0), '0,1': dot(0), '0,2': dot(0) });
    const edited = charPixels(16, 2, { '0,0': dot(5), '0,1': dot(6), '0,2': dot(0) });
    expect(propagateSharedEdits(base, edited, profile, 'none')).toBe(edited);
  });

  it('no propaga patrones de la ROM ni celdas vacías y devuelve el mismo arreglo si no hay nada', () => {
    const base = charPixels(16, 2, {});
    const edited = charPixels(16, 2, { '0,0': dot(1) });
    expect(propagateSharedEdits(base, edited, profile, 'none')).toBe(edited);
  });

  it('colocar un patrón escribe exactamente la celda indicada', () => {
    const px = stampPattern(
      new Uint8Array(80 * 16),
      profile,
      { row: 1, col: 2 },
      Uint8Array.from(dot(7)),
    );
    const a = analyzeCharacterFrame(px, profile, 'none');
    expect(a.glyphs).toHaveLength(1);
    expect(a.cellGlyph[16 + 2]).toBe(0);
  });
});
