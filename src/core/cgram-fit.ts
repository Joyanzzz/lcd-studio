import { getProfile, type CharacterProfile, type RomCharsetId } from '../device-profiles/index.ts';
import {
  analyzeCharacterFrame,
  CGRAM_SLOTS,
  freeGlyphs,
  type CellRef,
  type Glyph,
} from './charlcd.ts';
import { writeCellGlyph } from './pattern-edit.ts';
import type { Project } from './project.ts';

/**
 * Ajuste de un fotograma de LCD de caracteres al límite de 8 glifos propios.
 *
 * Un HD44780 solo tiene 8 ranuras CGRAM, así que un fotograma con más dibujos
 * distintos no se puede mostrar tal cual. Esta herramienta de EDICIÓN elige los
 * 8 glifos que mejor representan el fotograma y cambia cada celda sobrante por
 * el destino más parecido entre esos 8, los glifos de la ROM seleccionada o el
 * espacio (error = píxeles distintos de la celda, ponderado por repetición).
 * Es determinista, solo toca fotogramas que no caben y se aplica como una
 * edición normal (visible y deshacible): el exportador nunca sustituye nada.
 */

export type FitScope = 'current' | 'all';

export interface FrameFit {
  readonly frameIndex: number;
  /** Píxeles del fotograma ya ajustados (copia; el original no se modifica). */
  readonly pixels: Uint8Array;
  readonly changedCells: readonly CellRef[];
  /** Píxeles que cambian respecto al original. */
  readonly changedPixels: number;
  /** Glifos propios distintos antes y después del ajuste. */
  readonly glyphsBefore: number;
  readonly glyphsAfter: number;
}

const MAX_REFINEMENTS = 16;

const BITS = Uint8Array.from(
  { length: 32 },
  (_, v) => (v & 1) + ((v >> 1) & 1) + ((v >> 2) & 1) + ((v >> 3) & 1) + ((v >> 4) & 1),
);

function distance(a: Glyph, b: Glyph): number {
  let d = 0;
  for (let i = 0; i < 8; i++) d += BITS[(a[i]! ^ b[i]!) & 31]!;
  return d;
}

interface Assignment {
  /** Por glifo propio: índice en `[...libres, ...centros]`. */
  readonly choice: readonly number[];
  readonly cost: number;
}

function assign(
  customs: readonly Glyph[],
  weights: readonly number[],
  targets: readonly Glyph[],
): Assignment {
  let cost = 0;
  const choice = customs.map((glyph, i) => {
    let best = 0;
    let bestDistance = Infinity;
    targets.forEach((target, t) => {
      const d = distance(glyph, target);
      if (d < bestDistance) {
        best = t;
        bestDistance = d;
      }
    });
    cost += weights[i]! * bestDistance;
    return best;
  });
  return { choice, cost };
}

/** Elige 8 glifos propios entre los existentes: el que más reduce el error en cada paso. */
function pickCenters(
  customs: readonly Glyph[],
  weights: readonly number[],
  free: readonly Glyph[],
): Glyph[] {
  const near = customs.map((g) => Math.min(...free.map((f) => distance(g, f))));
  const chosen: number[] = [];
  while (chosen.length < CGRAM_SLOTS) {
    let pick = 0;
    let pickCost = Infinity;
    customs.forEach((candidate, c) => {
      if (chosen.includes(c)) return;
      let total = 0;
      customs.forEach((g, i) => {
        total += weights[i]! * Math.min(near[i]!, distance(g, candidate));
      });
      if (total < pickCost) {
        pick = c;
        pickCost = total;
      }
    });
    chosen.push(pick);
    customs.forEach((g, i) => {
      near[i] = Math.min(near[i]!, distance(g, customs[pick]!));
    });
  }
  return chosen.map((i) => customs[i]!.slice());
}

/**
 * Cada centro pasa a ser el glifo que más coincide con sus miembros (mayoría
 * ponderada por bit); en un empate, o sin miembros, conserva su valor.
 */
function recenter(
  centers: readonly Glyph[],
  members: readonly (readonly number[])[],
  customs: readonly Glyph[],
  weights: readonly number[],
): Glyph[] {
  return centers.map((center, k) => {
    const next = center.slice();
    for (let row = 0; row < 8; row++) {
      for (let bit = 0; bit < 5; bit++) {
        const mask = 0x10 >> bit;
        let total = 0;
        let set = 0;
        for (const i of members[k]!) {
          total += weights[i]!;
          if (customs[i]![row]! & mask) set += weights[i]!;
        }
        if (2 * set > total) next[row] = next[row]! | mask;
        else if (2 * set < total) next[row] = next[row]! & ~mask;
      }
    }
    return next;
  });
}

/** Ajusta un fotograma; `undefined` si ya cabe en las 8 ranuras. */
export function fitFrameToCgram(
  pixels: Uint8Array,
  profile: CharacterProfile,
  romCharset: RomCharsetId,
  frameIndex = 0,
): FrameFit | undefined {
  const analysis = analyzeCharacterFrame(pixels, profile, romCharset);
  const customs = analysis.glyphs;
  if (customs.length <= CGRAM_SLOTS) return undefined;

  const weights: number[] = customs.map(() => 0);
  for (const g of analysis.cellGlyph) if (g >= 0) weights[g] = weights[g]! + 1;
  const free = freeGlyphs(romCharset);

  let centers = pickCenters(customs, weights, free);
  let best = assign(customs, weights, [...free, ...centers]);
  let bestCenters = centers;
  for (let round = 0; round < MAX_REFINEMENTS; round++) {
    const members = centers.map((_, k) =>
      best.choice.flatMap((c, i) => (c === free.length + k ? [i] : [])),
    );
    centers = recenter(centers, members, customs, weights);
    const next = assign(customs, weights, [...free, ...centers]);
    if (next.cost >= best.cost) break;
    best = next;
    bestCenters = centers;
  }
  const targets = [...free, ...bestCenters];

  const out = pixels.slice();
  const changedCells: CellRef[] = [];
  let changedPixels = 0;
  analysis.cellGlyph.forEach((g, cell) => {
    if (g < 0) return;
    const target = targets[best.choice[g]!]!;
    const d = distance(customs[g]!, target);
    if (d === 0) return;
    const ref = { row: Math.floor(cell / profile.columns), col: cell % profile.columns };
    writeCellGlyph(out, profile.width, ref, target);
    changedCells.push(ref);
    changedPixels += d;
  });
  return {
    frameIndex,
    pixels: out,
    changedCells,
    changedPixels,
    glyphsBefore: customs.length,
    glyphsAfter: analyzeCharacterFrame(out, profile, romCharset).glyphs.length,
  };
}

/** Ajustes de los fotogramas del ámbito indicado que no caben (vacío si todos caben). */
export function fitProjectToCgram(project: Project, scope: FitScope, current: number): FrameFit[] {
  const profile = getProfile(project.profileId);
  if (!profile || profile.kind !== 'character') return [];
  const indices = scope === 'current' ? [current] : project.frames.map((_, i) => i);
  const fits: FrameFit[] = [];
  for (const i of indices) {
    const fit = fitFrameToCgram(project.frames[i]!.pixels, profile, project.romCharset, i);
    if (fit) fits.push(fit);
  }
  return fits;
}
