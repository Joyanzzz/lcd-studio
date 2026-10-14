import type { CharacterProfile, RomCharsetId } from '../device-profiles/index.ts';
import { HD44780_A00 } from '../device-profiles/rom/hd44780-a00.ts';

/**
 * Análisis de LCD de caracteres (HD44780).
 *
 * Cada celda de 5×8 píxeles se clasifica como:
 * - `blank`: todos los píxeles apagados → código 0x20 (espacio), presente en
 *   todas las ROM del HD44780.
 * - `rom`: coincide exactamente con un glifo del juego ROM seleccionado.
 * - `custom`: cualquier otro dibujo → necesita una ranura CGRAM (0–7).
 *
 * Nunca se sustituye contenido: si un fotograma necesita más de 8 glifos
 * propios distintos, las celdas sobrantes se informan como incompatibles y la
 * exportación debe bloquearse.
 */

export const CGRAM_SLOTS = 8;
export const SPACE_CODE = 0x20;

export interface CellRef {
  readonly row: number;
  readonly col: number;
}

/** Glifo de 8 filas; cada fila usa 5 bits (bit 4 = columna izquierda). */
export type Glyph = Uint8Array;

export function glyphKey(glyph: Glyph): string {
  return Array.prototype.join.call(glyph, ',');
}

export function extractCellGlyph(
  pixels: Uint8Array,
  width: number,
  row: number,
  col: number,
): Glyph {
  const glyph = new Uint8Array(8);
  for (let y = 0; y < 8; y++) {
    let bits = 0;
    const base = (row * 8 + y) * width + col * 5;
    for (let x = 0; x < 5; x++) if (pixels[base + x]) bits |= 0x10 >> x;
    glyph[y] = bits;
  }
  return glyph;
}

const romCache = new Map<RomCharsetId, ReadonlyMap<string, number>>();

/** Mapa glifo → código para el juego ROM (sin el espacio, que se trata aparte). */
export function romGlyphMap(romCharset: RomCharsetId): ReadonlyMap<string, number> {
  const cached = romCache.get(romCharset);
  if (cached) return cached;
  const map = new Map<string, number>();
  if (romCharset === 'hd44780-a00') {
    const codes = [...HD44780_A00.keys()].sort((a, b) => a - b);
    for (const code of codes) {
      if (code === SPACE_CODE) continue;
      const key = glyphKey(Uint8Array.from(HD44780_A00.get(code)!));
      if (!map.has(key)) map.set(key, code);
    }
  }
  romCache.set(romCharset, map);
  return map;
}

const freeCache = new Map<RomCharsetId, readonly Glyph[]>();

/** Glifos que no consumen ranura CGRAM: el espacio y los del juego ROM. */
export function freeGlyphs(romCharset: RomCharsetId): readonly Glyph[] {
  const cached = freeCache.get(romCharset);
  if (cached) return cached;
  const glyphs: Glyph[] = [new Uint8Array(8)];
  for (const key of romGlyphMap(romCharset).keys()) {
    glyphs.push(Uint8Array.from(key.split(',').map(Number)));
  }
  freeCache.set(romCharset, glyphs);
  return glyphs;
}

export interface FrameCellAnalysis {
  /** Glifos propios distintos en orden de lectura (fila a fila). */
  readonly glyphs: readonly Glyph[];
  /** Por celda: índice en `glyphs`, o -1 si es espacio o ROM. */
  readonly cellGlyph: Int16Array;
  /** Por celda: código ROM (incluido 0x20 para vacías) o -1 si es propio. */
  readonly cellRom: Int16Array;
  /** Celdas cuyo glifo no cabe en las 8 ranuras CGRAM. */
  readonly overflow: readonly CellRef[];
}

export function analyzeCharacterFrame(
  pixels: Uint8Array,
  profile: CharacterProfile,
  romCharset: RomCharsetId,
): FrameCellAnalysis {
  const { columns, rows, width } = profile;
  const rom = romGlyphMap(romCharset);
  const cellCount = columns * rows;
  const cellGlyph = new Int16Array(cellCount).fill(-1);
  const cellRom = new Int16Array(cellCount).fill(-1);
  const glyphs: Glyph[] = [];
  const index = new Map<string, number>();
  const overflow: CellRef[] = [];
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const cell = r * columns + c;
      const glyph = extractCellGlyph(pixels, width, r, c);
      if (glyph.every((b) => b === 0)) {
        cellRom[cell] = SPACE_CODE;
        continue;
      }
      const key = glyphKey(glyph);
      const romCode = rom.get(key);
      if (romCode !== undefined) {
        cellRom[cell] = romCode;
        continue;
      }
      let gi = index.get(key);
      if (gi === undefined) {
        gi = glyphs.length;
        index.set(key, gi);
        glyphs.push(glyph);
      }
      cellGlyph[cell] = gi;
      if (gi >= CGRAM_SLOTS) overflow.push({ row: r, col: c });
    }
  }
  return { glyphs, cellGlyph, cellRom, overflow };
}

export interface FramePlan {
  /** Índice del fotograma en el proyecto. */
  readonly frameIndex: number;
  /** Por ranura CGRAM: índice en `glyphPool`, o -1 si queda libre. */
  readonly slots: Int32Array;
  /** Código DDRAM por celda (fila a fila): 0–7 CGRAM, 0x20 espacio, otros ROM. */
  readonly cells: Uint8Array;
  /** Ranuras que cambian respecto al fotograma anterior del plan. */
  readonly reloads: readonly number[];
}

export interface FrameOverflow {
  readonly frameIndex: number;
  readonly cells: readonly CellRef[];
  readonly glyphCount: number;
}

export interface CharacterPlan {
  readonly glyphPool: readonly Glyph[];
  readonly frames: readonly FramePlan[];
  readonly overflow: readonly FrameOverflow[];
}

/**
 * Plan de animación para LCD de caracteres: banco global de glifos, ranuras
 * CGRAM por fotograma (estables entre fotogramas para minimizar recargas) y
 * códigos de celda. Si algún fotograma excede las 8 ranuras, `overflow` no
 * está vacío y `frames` no debe usarse para generar código.
 */
export function planCharacterAnimation(
  frames: readonly { readonly pixels: Uint8Array }[],
  frameIndices: readonly number[],
  profile: CharacterProfile,
  romCharset: RomCharsetId,
): CharacterPlan {
  const pool: Glyph[] = [];
  const poolIndex = new Map<string, number>();
  const overflow: FrameOverflow[] = [];
  const plans: FramePlan[] = [];
  let loaded = new Int32Array(CGRAM_SLOTS).fill(-1);
  const cellCount = profile.columns * profile.rows;

  for (const frameIndex of frameIndices) {
    const frame = frames[frameIndex];
    if (!frame) throw new Error(`Fotograma inexistente: ${frameIndex}`);
    const analysis = analyzeCharacterFrame(frame.pixels, profile, romCharset);
    if (analysis.overflow.length > 0) {
      overflow.push({
        frameIndex,
        cells: analysis.overflow,
        glyphCount: analysis.glyphs.length,
      });
      continue;
    }
    const needed = analysis.glyphs.map((g) => {
      const key = glyphKey(g);
      let pi = poolIndex.get(key);
      if (pi === undefined) {
        pi = pool.length;
        poolIndex.set(key, pi);
        pool.push(g);
      }
      return pi;
    });
    const neededSet = new Set(needed);
    const slots = new Int32Array(CGRAM_SLOTS).fill(-1);
    // Conservar los glifos que ya estaban cargados.
    for (let s = 0; s < CGRAM_SLOTS; s++) {
      if (neededSet.has(loaded[s]!)) slots[s] = loaded[s]!;
    }
    const placed = new Set<number>(Array.from(slots).filter((v) => v >= 0));
    for (const pi of needed) {
      if (placed.has(pi)) continue;
      // Preferir ranuras nunca usadas; después, las que tenían glifos no necesarios.
      let s = -1;
      for (let k = 0; k < CGRAM_SLOTS; k++) {
        if (slots[k] === -1 && loaded[k] === -1) {
          s = k;
          break;
        }
      }
      if (s < 0) {
        for (let k = 0; k < CGRAM_SLOTS; k++) {
          if (slots[k] === -1) {
            s = k;
            break;
          }
        }
      }
      slots[s] = pi;
      placed.add(pi);
    }
    const slotOf = new Map<number, number>();
    for (let s = 0; s < CGRAM_SLOTS; s++) if (slots[s]! >= 0) slotOf.set(slots[s]!, s);
    const cells = new Uint8Array(cellCount);
    for (let cell = 0; cell < cellCount; cell++) {
      const gi = analysis.cellGlyph[cell]!;
      cells[cell] = gi >= 0 ? slotOf.get(needed[gi]!)! : analysis.cellRom[cell]!;
    }
    const reloads: number[] = [];
    for (let s = 0; s < CGRAM_SLOTS; s++) {
      if (slots[s]! >= 0 && slots[s] !== loaded[s]) reloads.push(s);
    }
    // Las ranuras que no se usan conservan su contenido anterior en el LCD.
    const nextLoaded = loaded.slice();
    for (let s = 0; s < CGRAM_SLOTS; s++) if (slots[s]! >= 0) nextLoaded[s] = slots[s]!;
    loaded = nextLoaded;
    plans.push({ frameIndex, slots, cells, reloads });
  }
  return { glyphPool: pool, frames: plans, overflow };
}
