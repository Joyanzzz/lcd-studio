import {
  createProject,
  insertFrames,
  createFrame,
  replaceFramePixels,
  setFrameDuration,
  setLoopMode,
  type LoopMode,
  type Project,
} from '../../src/core/project.ts';
import { getProfile } from '../../src/device-profiles/index.ts';
import type { ExportContext } from '../../src/exporters/types.ts';

/** Proyecto de prueba con los fotogramas indicados. */
export function makeProject(
  profileId: string,
  frames: { pixels: Uint8Array; durationMs?: number }[],
  options: { loopMode?: LoopMode; width?: number; height?: number; name?: string } = {},
): Project {
  let p = createProject({
    name: options.name ?? 'Prueba',
    profileId,
    ...(options.width !== undefined ? { width: options.width } : {}),
    ...(options.height !== undefined ? { height: options.height } : {}),
  });
  p = replaceFramePixels(p, 0, frames[0]!.pixels);
  if (frames[0]!.durationMs !== undefined) p = setFrameDuration(p, 0, frames[0]!.durationMs);
  if (frames.length > 1) {
    p = insertFrames(
      p,
      1,
      frames.slice(1).map((f) => createFrame(f.pixels, f.durationMs ?? 200)),
    );
  }
  return setLoopMode(p, options.loopMode ?? 'loop');
}

export function ctxFor(project: Project, currentFrame = 0): ExportContext {
  return { project, profile: getProfile(project.profileId)!, currentFrame, appVersion: '1.0.0' };
}

/** Dibuja glifos de 5×8 por celda (filas de 5 bits) en un lienzo de caracteres. */
export function charPixels(
  columns: number,
  rows: number,
  cells: Record<string, readonly number[]>,
): Uint8Array {
  const width = columns * 5;
  const px = new Uint8Array(width * rows * 8);
  for (const [key, glyph] of Object.entries(cells)) {
    const [r, c] = key.split(',').map(Number) as [number, number];
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 5; x++)
        if (glyph[y]! & (0x10 >> x)) px[(r * 8 + y) * width + c * 5 + x] = 1;
    }
  }
  return px;
}

export const HEART = [0b00000, 0b01010, 0b11111, 0b11111, 0b01110, 0b00100, 0b00000, 0b00000];
export const SMILE = [0b00000, 0b01010, 0b00000, 0b10001, 0b01110, 0b00000, 0b00000, 0b00000];
export const BAR = [0b11111, 0b11111, 0b00000, 0b00000, 0b00000, 0b00000, 0b11111, 0b11111];
