import type { CharacterProfile, RomCharsetId } from '../device-profiles/index.ts';
import { extractCellGlyph, glyphKey, romGlyphMap, type CellRef, type Glyph } from './charlcd.ts';

/**
 * Edición de patrones compartidos en LCD de caracteres.
 *
 * Un patrón propio puede aparecer en varias celdas del fotograma. Al editar
 * una de ellas hay dos resultados posibles, que el usuario elige antes de
 * dibujar:
 * - `copy` (predeterminado): solo cambia la celda editada; si el resultado es
 *   un patrón nuevo, necesita una ranura CGRAM libre.
 * - `global`: el cambio se aplica a todas las apariciones del patrón en el
 *   fotograma actual (como editar la ranura CGRAM); no consume ranuras.
 *
 * En `global`, si varias apariciones del mismo patrón se editan de forma
 * distinta en la misma operación, no hay un resultado único y ese patrón se
 * trata como `copy`.
 */

export type SharedEditMode = 'copy' | 'global';

function isCustom(glyph: Glyph, rom: ReadonlyMap<string, number>): boolean {
  return glyph.some((b) => b !== 0) && !rom.has(glyphKey(glyph));
}

export function writeCellGlyph(
  pixels: Uint8Array,
  width: number,
  cell: CellRef,
  glyph: Glyph,
): void {
  for (let y = 0; y < 8; y++) {
    const base = (cell.row * 8 + y) * width + cell.col * 5;
    for (let x = 0; x < 5; x++) pixels[base + x] = (glyph[y]! >> (4 - x)) & 1;
  }
}

/**
 * Aplica a las demás apariciones de cada patrón propio editado el mismo
 * resultado. Devuelve `next` sin copiar si no hay nada que propagar.
 */
export function propagateSharedEdits(
  base: Uint8Array,
  next: Uint8Array,
  profile: CharacterProfile,
  romCharset: RomCharsetId,
): Uint8Array {
  const { columns, rows, width } = profile;
  const rom = romGlyphMap(romCharset);
  const mapping = new Map<string, Glyph | null>();
  const baseKeys: (string | null)[] = [];
  const changed: boolean[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const before = extractCellGlyph(base, width, r, c);
      const after = extractCellGlyph(next, width, r, c);
      const key = isCustom(before, rom) ? glyphKey(before) : null;
      const diff = glyphKey(before) !== glyphKey(after);
      baseKeys.push(key);
      changed.push(diff);
      if (key === null || !diff) continue;
      const known = mapping.get(key);
      if (known === undefined) mapping.set(key, after);
      else if (known !== null && glyphKey(known) !== glyphKey(after)) mapping.set(key, null);
    }
  }
  let out: Uint8Array | null = null;
  baseKeys.forEach((key, cell) => {
    if (key === null || changed[cell]) return;
    const target = mapping.get(key);
    if (!target) return;
    out ??= next.slice();
    writeCellGlyph(out, width, { row: Math.floor(cell / columns), col: cell % columns }, target);
  });
  return out ?? next;
}

/** Coloca un patrón en una celda (repetir un patrón existente de la paleta). */
export function stampPattern(
  pixels: Uint8Array,
  profile: CharacterProfile,
  cell: CellRef,
  glyph: Glyph,
): Uint8Array {
  const out = pixels.slice();
  writeCellGlyph(out, profile.width, cell, glyph);
  return out;
}
