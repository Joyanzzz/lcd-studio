import { getProfile, type CharacterProfile, type RomCharsetId } from '../device-profiles/index.ts';
import { analyzeCharacterFrame, CGRAM_SLOTS, type FrameCellAnalysis } from './charlcd.ts';
import type { Project } from './project.ts';

/**
 * Restricciones de contenido por familia de pantalla, compartidas por la
 * edición, la importación, los atajos y la exportación.
 *
 * LCD de caracteres HD44780: como máximo 8 patrones propios distintos por
 * fotograma (ranuras CGRAM). Un patrón repetido en varias celdas ocupa una
 * sola ranura; el espacio y los glifos de la ROM elegida no ocupan ninguna.
 *
 * Regla de una edición (`previous` → `next`): cada fotograma resultante debe
 * tener ≤ 8 patrones propios o, si ya excedía el límite (proyecto antiguo en
 * reparación), no aumentar su número. Los fotogramas nuevos no tienen
 * excepción. Nunca se recorta contenido para que quepa: la edición entera se
 * acepta o se rechaza.
 */

export interface CgramViolation {
  readonly code: 'cgram.limit';
  /** Índice del primer fotograma que incumple. */
  readonly frameIndex: number;
  /** Patrones propios distintos que tendría. */
  readonly glyphs: number;
  /** Patrones que tenía antes (0 si el fotograma es nuevo). */
  readonly previous: number;
  readonly max: number;
}

const analysisCache = new WeakMap<Uint8Array, Map<string, FrameCellAnalysis>>();

/** Análisis CGRAM con caché por arreglo de píxeles (los fotogramas son inmutables). */
export function cachedAnalysis(
  pixels: Uint8Array,
  profile: CharacterProfile,
  romCharset: RomCharsetId,
): FrameCellAnalysis {
  const key = `${profile.id}|${romCharset}`;
  let byKey = analysisCache.get(pixels);
  if (!byKey) analysisCache.set(pixels, (byKey = new Map()));
  let analysis = byKey.get(key);
  if (!analysis) {
    analysis = analyzeCharacterFrame(pixels, profile, romCharset);
    byKey.set(key, analysis);
  }
  return analysis;
}

/** Patrones propios distintos de un fotograma. */
export function customPatternCount(
  pixels: Uint8Array,
  profile: CharacterProfile,
  romCharset: RomCharsetId,
): number {
  return cachedAnalysis(pixels, profile, romCharset).glyphs.length;
}

function characterProfileOf(project: Project): CharacterProfile | undefined {
  const profile = getProfile(project.profileId);
  return profile?.kind === 'character' ? profile : undefined;
}

/** Fotogramas que exceden el límite (proyecto en estado de reparación). */
export function overLimitFrames(project: Project): number[] {
  const profile = characterProfileOf(project);
  if (!profile) return [];
  const out: number[] = [];
  project.frames.forEach((f, i) => {
    if (customPatternCount(f.pixels, profile, project.romCharset) > CGRAM_SLOTS) out.push(i);
  });
  return out;
}

/** Comprueba un fotograma resultante frente a su estado anterior. */
export function checkFramePatterns(
  pixels: Uint8Array,
  previousPixels: Uint8Array | undefined,
  profile: CharacterProfile,
  romCharset: RomCharsetId,
  previousRom: RomCharsetId = romCharset,
  /** `false` para búferes que se siguen modificando (gesto en curso): no se guardan en caché. */
  cacheCandidate = true,
): { glyphs: number; previous: number; ok: boolean } {
  const glyphs = cacheCandidate
    ? customPatternCount(pixels, profile, romCharset)
    : analyzeCharacterFrame(pixels, profile, romCharset).glyphs.length;
  if (glyphs <= CGRAM_SLOTS) return { glyphs, previous: 0, ok: true };
  const previous = previousPixels ? customPatternCount(previousPixels, profile, previousRom) : 0;
  return { glyphs, previous, ok: glyphs <= previous };
}

/**
 * Valida el resultado completo de una edición. Devuelve la primera infracción
 * o `null` si el nuevo estado está permitido.
 */
export function validateTransition(previous: Project, next: Project): CgramViolation | null {
  const profile = characterProfileOf(next);
  if (!profile) return null;
  const prevProfile = characterProfileOf(previous);
  // Solo se compara con el estado anterior si la geometría de celdas es la misma.
  const comparable =
    prevProfile !== undefined &&
    prevProfile.columns === profile.columns &&
    prevProfile.rows === profile.rows;
  const before = new Map<number, Uint8Array>();
  if (comparable) for (const f of previous.frames) before.set(f.id, f.pixels);
  const sameRules = comparable && previous.romCharset === next.romCharset;

  for (let i = 0; i < next.frames.length; i++) {
    const frame = next.frames[i]!;
    const old = before.get(frame.id);
    // Fotograma sin cambios bajo las mismas reglas: ya se aceptó antes.
    if (sameRules && old === frame.pixels) continue;
    const check = checkFramePatterns(
      frame.pixels,
      old,
      profile,
      next.romCharset,
      previous.romCharset,
    );
    if (!check.ok) {
      return {
        code: 'cgram.limit',
        frameIndex: i,
        glyphs: check.glyphs,
        previous: check.previous,
        max: CGRAM_SLOTS,
      };
    }
  }
  return null;
}

/**
 * Celdas donde dibujar crearía un patrón propio nuevo sin ranura libre. Solo
 * se calculan cuando el fotograma ya usa las 8 ranuras (o más). Las celdas
 * vacías o de la ROM y, en modo «copia», las que comparten patrón con otras
 * necesitarían una ranura nueva; las que tienen un patrón único se pueden
 * editar porque su ranura se reutiliza. Repetir un patrón existente (pegar o
 * colocar un patrón de la paleta) sigue permitido en cualquier celda.
 */
export function unavailableCells(
  analysis: FrameCellAnalysis,
  sharedEdit: 'copy' | 'global',
): Uint8Array {
  const cells = new Uint8Array(analysis.cellGlyph.length);
  if (analysis.glyphs.length < CGRAM_SLOTS) return cells;
  const uses = new Int32Array(analysis.glyphs.length);
  for (const g of analysis.cellGlyph) if (g >= 0) uses[g] = uses[g]! + 1;
  analysis.cellGlyph.forEach((g, cell) => {
    if (g < 0) cells[cell] = 1;
    else if (sharedEdit === 'copy' && uses[g]! > 1) cells[cell] = 1;
  });
  return cells;
}

/** Número de celdas que usan cada patrón propio del fotograma. */
export function patternUses(analysis: FrameCellAnalysis): number[] {
  const uses = analysis.glyphs.map(() => 0);
  for (const g of analysis.cellGlyph) if (g >= 0) uses[g] = uses[g]! + 1;
  return uses;
}
