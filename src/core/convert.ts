import { profileCanvasSize, type DisplayProfile } from '../device-profiles/index.ts';
import { defaultAppearanceFor } from './appearance.ts';
import { overLimitFrames } from './constraints.ts';
import { adaptDevice } from './device.ts';
import { AppError } from './errors.ts';
import { assertCanvasSize, projectMemoryBytes } from './limits.ts';
import { requireProfile, resizePixels, type Project } from './project.ts';

/**
 * Conversión de pantalla (Proyecto → Convertir pantalla). Todas las familias
 * actuales son mapas de píxeles, así que la regla común es geométrica:
 *
 * - `crop-top-left` / `crop-center`: se conserva cada píxel en su posición
 *   (anclado arriba a la izquierda o centrado); lo que no cabe se recorta y
 *   el espacio nuevo queda apagado.
 * - `scale`: se remuestrea al nuevo tamaño por vecino más próximo (puede
 *   duplicar o perder píxeles; no hay grises).
 *
 * Reglas por familia (nunca se inventan equivalencias):
 * - Hacia LCD de caracteres: los fotogramas que superen 8 caracteres propios
 *   NO se ajustan solos: el proyecto queda en reparación y se avisa antes.
 * - Desde LCD de caracteres: el mapa ROM deja de aplicarse (pasa a `none`).
 * - Al cambiar de familia se usan los colores predeterminados de la nueva.
 * - La conexión y el destino de código se conservan solo si siguen siendo
 *   válidos para la nueva pantalla; si no, quedan sin configurar.
 * La conversión es una única edición deshacible y no toca ningún archivo.
 */

export type ConvertMode = 'crop-top-left' | 'crop-center' | 'scale';
export const CONVERT_MODES: readonly ConvertMode[] = ['crop-top-left', 'crop-center', 'scale'];

export interface ConversionReport {
  readonly from: { readonly width: number; readonly height: number };
  readonly to: { readonly width: number; readonly height: number };
  readonly sizeChanged: boolean;
  readonly mode: ConvertMode;
  /** Píxeles encendidos que se pierden al recortar (todos los fotogramas). */
  readonly lostLitPixels: number;
  readonly familyChanged: boolean;
  readonly appearanceChanged: boolean;
  readonly romReset: boolean;
  readonly connectionReset: boolean;
  readonly targetReset: boolean;
  /** Fotogramas que quedarían por encima de 8 caracteres propios. */
  readonly overLimitFrames: readonly number[];
}

function cropPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  newWidth: number,
  newHeight: number,
  center: boolean,
): Uint8Array {
  if (!center) return resizePixels(pixels, width, height, newWidth, newHeight);
  const out = new Uint8Array(newWidth * newHeight);
  const dx = Math.floor((newWidth - width) / 2);
  const dy = Math.floor((newHeight - height) / 2);
  for (let y = 0; y < height; y++) {
    const ty = y + dy;
    if (ty < 0 || ty >= newHeight) continue;
    for (let x = 0; x < width; x++) {
      const tx = x + dx;
      if (tx >= 0 && tx < newWidth) out[ty * newWidth + tx] = pixels[y * width + x]!;
    }
  }
  return out;
}

function scalePixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  newWidth: number,
  newHeight: number,
): Uint8Array {
  const out = new Uint8Array(newWidth * newHeight);
  for (let y = 0; y < newHeight; y++) {
    const sy = Math.min(height - 1, Math.floor(((y + 0.5) * height) / newHeight));
    for (let x = 0; x < newWidth; x++) {
      const sx = Math.min(width - 1, Math.floor(((x + 0.5) * width) / newWidth));
      out[y * newWidth + x] = pixels[sy * width + sx]!;
    }
  }
  return out;
}

function lit(p: Uint8Array): number {
  let n = 0;
  for (const v of p) if (v) n++;
  return n;
}

export function convertPixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  newWidth: number,
  newHeight: number,
  mode: ConvertMode,
): Uint8Array {
  if (width === newWidth && height === newHeight) return pixels;
  return mode === 'scale'
    ? scalePixels(pixels, width, height, newWidth, newHeight)
    : cropPixels(pixels, width, height, newWidth, newHeight, mode === 'crop-center');
}

/** Convierte el proyecto a otro perfil y devuelve qué cambia (para mostrarlo antes). */
export function convertProject(
  project: Project,
  profileId: string,
  customSize: { width: number; height: number } | undefined,
  mode: ConvertMode,
): { project: Project; report: ConversionReport } {
  const from = requireProfile(project.profileId);
  const profile: DisplayProfile = requireProfile(profileId);
  const size = profileCanvasSize(profile, customSize);
  if (!size) throw new AppError('project.sizeRequired');
  assertCanvasSize(size.width, size.height);
  projectMemoryBytes(size.width, size.height, project.frames.length);
  const sizeChanged = size.width !== project.width || size.height !== project.height;
  let lostLitPixels = 0;
  const frames = project.frames.map((f) => {
    const pixels = convertPixels(
      f.pixels,
      project.width,
      project.height,
      size.width,
      size.height,
      mode,
    );
    if (mode !== 'scale' && pixels !== f.pixels) lostLitPixels += lit(f.pixels) - lit(pixels);
    return pixels === f.pixels ? f : Object.freeze({ id: f.id, durationMs: f.durationMs, pixels });
  });
  const familyChanged = from.kind !== profile.kind;
  const appearance = familyChanged ? defaultAppearanceFor(profile.kind) : project.appearance;
  const romCharset =
    profile.kind === 'character' && profile.romCharsets.includes(project.romCharset)
      ? project.romCharset
      : 'none';
  const device = adaptDevice(profile, project.device);
  const next: Project = Object.freeze({
    ...project,
    profileId: profile.id,
    width: size.width,
    height: size.height,
    appearance,
    romCharset,
    device,
    frames: Object.freeze(frames),
  });
  return {
    project: next,
    report: {
      from: { width: project.width, height: project.height },
      to: size,
      sizeChanged,
      mode,
      lostLitPixels,
      familyChanged,
      appearanceChanged: JSON.stringify(appearance) !== JSON.stringify(project.appearance),
      romReset: romCharset !== project.romCharset,
      connectionReset: project.device.connection !== null && device.connection === null,
      targetReset: project.device.codeTarget !== null && device.codeTarget === null,
      overLimitFrames: overLimitFrames(next),
    },
  };
}
