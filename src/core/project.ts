import {
  getProfile,
  profileCanvasSize,
  type DisplayProfile,
  type RomCharsetId,
} from '../device-profiles/index.ts';
import { defaultAppearanceFor, isValidAppearance, type Appearance } from './appearance.ts';
import { defaultDevice, deviceErrors, type DeviceConfig } from './device.ts';
import { AppError } from './errors.ts';
import { assertCanvasSize, isIntInRange, isValidDuration, LIMITS } from './limits.ts';
import { isValidProjectName, sanitizeProjectName } from './names.ts';

export type LoopMode = 'loop' | 'pingpong' | 'once';
export const LOOP_MODES: readonly LoopMode[] = Object.freeze(['loop', 'pingpong', 'once']);

export function isLoopMode(value: unknown): value is LoopMode {
  return typeof value === 'string' && (LOOP_MODES as readonly string[]).includes(value);
}

/**
 * Fotograma inmutable. `pixels` nunca se modifica después de crear el
 * fotograma: las ediciones producen un arreglo nuevo, lo que permite compartir
 * memoria entre estados del historial.
 */
export interface Frame {
  /** Identificador de sesión (no se guarda en el archivo). */
  readonly id: number;
  readonly durationMs: number;
  readonly pixels: Uint8Array;
}

export interface Project {
  readonly name: string;
  readonly profileId: string;
  readonly width: number;
  readonly height: number;
  readonly appearance: Appearance;
  readonly loopMode: LoopMode;
  readonly romCharset: RomCharsetId;
  /** Conexión, destino de código y (matrices LED) orientación física. */
  readonly device: DeviceConfig;
  readonly frames: readonly Frame[];
}

let frameIdCounter = 0;

/** Identificador de sesión único y creciente para fotogramas. */
export function nextFrameId(): number {
  frameIdCounter += 1;
  return frameIdCounter;
}

export function createFrame(pixels: Uint8Array, durationMs: number): Frame {
  if (!isValidDuration(durationMs)) {
    throw new AppError('project.invalidDuration', {
      value: String(durationMs),
      min: LIMITS.frameDurationMinMs,
      max: LIMITS.frameDurationMaxMs,
    });
  }
  return Object.freeze({ id: nextFrameId(), durationMs, pixels });
}

export function blankFrame(
  width: number,
  height: number,
  durationMs: number = LIMITS.frameDurationDefaultMs,
): Frame {
  assertCanvasSize(width, height);
  return createFrame(new Uint8Array(width * height), durationMs);
}

export function requireProfile(profileId: string): DisplayProfile {
  const profile = getProfile(profileId);
  if (!profile) throw new AppError('project.unknownProfile', { profile: profileId });
  return profile;
}

export interface NewProjectOptions {
  readonly name: string;
  readonly profileId: string;
  /** Solo para perfiles sin tamaño fijo. */
  readonly width?: number;
  readonly height?: number;
  /** Configuración del asistente; si falta, «solo diseño». */
  readonly device?: DeviceConfig;
}

export function createProject(options: NewProjectOptions): Project {
  const profile = requireProfile(options.profileId);
  const custom =
    options.width !== undefined && options.height !== undefined
      ? { width: options.width, height: options.height }
      : undefined;
  const size = profileCanvasSize(profile, custom);
  if (!size) throw new AppError('project.sizeRequired');
  assertCanvasSize(size.width, size.height);
  const device = options.device ?? defaultDevice(profile);
  if (deviceErrors(profile, device).length > 0) throw new AppError('device.invalid');
  return freezeProject({
    name: sanitizeProjectName(options.name),
    profileId: profile.id,
    width: size.width,
    height: size.height,
    appearance: defaultAppearanceFor(profile.kind),
    loopMode: 'loop',
    romCharset: 'none',
    device: Object.freeze({ ...device }),
    frames: [blankFrame(size.width, size.height)],
  });
}

function freezeProject(project: Project): Project {
  return Object.freeze({ ...project, frames: Object.freeze([...project.frames]) });
}

/**
 * Comprueba todas las invariantes del proyecto. Devuelve la lista de códigos
 * de error (vacía si el proyecto es válido).
 */
export function projectInvariantErrors(project: Project): string[] {
  const errors: string[] = [];
  const profile = getProfile(project.profileId);
  if (!profile) {
    errors.push('project.unknownProfile');
    return errors;
  }
  if (!isValidProjectName(project.name)) errors.push('project.invalidName');
  const expected = profileCanvasSize(profile, { width: project.width, height: project.height });
  if (
    !expected ||
    expected.width !== project.width ||
    expected.height !== project.height ||
    !isIntInRange(project.width, 1, LIMITS.canvasMaxSide) ||
    !isIntInRange(project.height, 1, LIMITS.canvasMaxSide)
  ) {
    errors.push('project.invalidSize');
  }
  if (!isValidAppearance(project.appearance)) errors.push('project.invalidAppearance');
  if (!isLoopMode(project.loopMode)) errors.push('project.invalidLoopMode');
  if (profile.kind === 'character') {
    if (!profile.romCharsets.includes(project.romCharset)) errors.push('project.invalidRom');
  } else if (project.romCharset !== 'none') {
    errors.push('project.invalidRom');
  }
  if (!project.device) errors.push('device.invalid');
  else errors.push(...deviceErrors(profile, project.device));
  if (!isIntInRange(project.frames.length, 1, LIMITS.maxFrames)) {
    errors.push('project.invalidFrameCount');
  }
  const pixelCount = project.width * project.height;
  for (const frame of project.frames) {
    if (!(frame.pixels instanceof Uint8Array) || frame.pixels.length !== pixelCount) {
      errors.push('project.invalidFramePixels');
      break;
    }
    if (!isValidDuration(frame.durationMs)) {
      errors.push('project.invalidDuration');
      break;
    }
  }
  return errors;
}

function withFrames(project: Project, frames: readonly Frame[]): Project {
  if (frames.length < 1) throw new AppError('project.lastFrame');
  if (frames.length > LIMITS.maxFrames) {
    throw new AppError('project.tooManyFrames', { max: LIMITS.maxFrames });
  }
  return freezeProject({ ...project, frames });
}

function assertIndex(project: Project, index: number): void {
  if (!isIntInRange(index, 0, project.frames.length - 1)) {
    throw new AppError('project.frameIndex', { index: String(index) });
  }
}

function assertPixels(project: Project, pixels: Uint8Array): void {
  if (pixels.length !== project.width * project.height) {
    throw new AppError('project.invalidFramePixels');
  }
}

export function replaceFramePixels(project: Project, index: number, pixels: Uint8Array): Project {
  assertIndex(project, index);
  assertPixels(project, pixels);
  const frames = project.frames.slice();
  const old = frames[index]!;
  frames[index] = Object.freeze({ id: old.id, durationMs: old.durationMs, pixels });
  return withFrames(project, frames);
}

/** Reemplaza varios fotogramas a la vez (transformaciones sobre todos). */
export function replaceManyPixels(
  project: Project,
  changes: ReadonlyMap<number, Uint8Array>,
): Project {
  const frames = project.frames.slice();
  for (const [index, pixels] of changes) {
    assertIndex(project, index);
    assertPixels(project, pixels);
    const old = frames[index]!;
    frames[index] = Object.freeze({ id: old.id, durationMs: old.durationMs, pixels });
  }
  return withFrames(project, frames);
}

export function insertFrames(project: Project, at: number, newFrames: readonly Frame[]): Project {
  if (!isIntInRange(at, 0, project.frames.length)) {
    throw new AppError('project.frameIndex', { index: String(at) });
  }
  if (project.frames.length + newFrames.length > LIMITS.maxFrames) {
    throw new AppError('project.tooManyFrames', { max: LIMITS.maxFrames });
  }
  for (const frame of newFrames) assertPixels(project, frame.pixels);
  const frames = project.frames.slice();
  frames.splice(at, 0, ...newFrames);
  return withFrames(project, frames);
}

/** Sustituye todos los fotogramas (p. ej. al importar una secuencia). */
export function replaceAllFrames(project: Project, newFrames: readonly Frame[]): Project {
  for (const frame of newFrames) assertPixels(project, frame.pixels);
  return withFrames(project, newFrames.slice());
}

export function insertBlankFrame(project: Project, at: number, durationMs: number): Project {
  return insertFrames(project, at, [blankFrame(project.width, project.height, durationMs)]);
}

export function duplicateFrame(project: Project, index: number): Project {
  assertIndex(project, index);
  const source = project.frames[index]!;
  // El arreglo de píxeles es inmutable: se puede compartir sin copiarlo.
  return insertFrames(project, index + 1, [createFrame(source.pixels, source.durationMs)]);
}

export function deleteFrame(project: Project, index: number): Project {
  assertIndex(project, index);
  if (project.frames.length <= 1) throw new AppError('project.lastFrame');
  const frames = project.frames.slice();
  frames.splice(index, 1);
  return withFrames(project, frames);
}

export function moveFrame(project: Project, from: number, to: number): Project {
  assertIndex(project, from);
  assertIndex(project, to);
  if (from === to) return project;
  const frames = project.frames.slice();
  const [moved] = frames.splice(from, 1);
  frames.splice(to, 0, moved!);
  return withFrames(project, frames);
}

export function setFrameDuration(project: Project, index: number, durationMs: number): Project {
  assertIndex(project, index);
  if (!isValidDuration(durationMs)) {
    throw new AppError('project.invalidDuration', {
      value: String(durationMs),
      min: LIMITS.frameDurationMinMs,
      max: LIMITS.frameDurationMaxMs,
    });
  }
  const frames = project.frames.slice();
  const old = frames[index]!;
  if (old.durationMs === durationMs) return project;
  frames[index] = Object.freeze({ id: old.id, durationMs, pixels: old.pixels });
  return withFrames(project, frames);
}

export function setAllDurations(project: Project, durationMs: number): Project {
  if (!isValidDuration(durationMs)) {
    throw new AppError('project.invalidDuration', {
      value: String(durationMs),
      min: LIMITS.frameDurationMinMs,
      max: LIMITS.frameDurationMaxMs,
    });
  }
  return withFrames(
    project,
    project.frames.map((f) => Object.freeze({ id: f.id, durationMs, pixels: f.pixels })),
  );
}

export function setLoopMode(project: Project, loopMode: LoopMode): Project {
  if (!isLoopMode(loopMode)) throw new AppError('project.invalidLoopMode');
  return freezeProject({ ...project, loopMode });
}

export function setAppearance(project: Project, appearance: Appearance): Project {
  if (!isValidAppearance(appearance)) throw new AppError('project.invalidAppearance');
  return freezeProject({ ...project, appearance });
}

export function renameProject(project: Project, name: string): Project {
  const clean = sanitizeProjectName(name, '');
  if (!clean) throw new AppError('project.invalidName');
  return freezeProject({ ...project, name: clean });
}

export function setDevice(project: Project, device: DeviceConfig): Project {
  const profile = requireProfile(project.profileId);
  if (deviceErrors(profile, device).length > 0) throw new AppError('device.invalid');
  return freezeProject({ ...project, device: Object.freeze({ ...device }) });
}

export function setRomCharset(project: Project, romCharset: RomCharsetId): Project {
  const profile = requireProfile(project.profileId);
  if (profile.kind !== 'character' || !profile.romCharsets.includes(romCharset)) {
    throw new AppError('project.invalidRom');
  }
  return freezeProject({ ...project, romCharset });
}

/** Recorta o amplía un mapa de píxeles anclándolo en la esquina superior izquierda. */
export function resizePixels(
  pixels: Uint8Array,
  width: number,
  height: number,
  newWidth: number,
  newHeight: number,
): Uint8Array {
  assertCanvasSize(newWidth, newHeight);
  const out = new Uint8Array(newWidth * newHeight);
  const w = Math.min(width, newWidth);
  const h = Math.min(height, newHeight);
  for (let y = 0; y < h; y++) {
    out.set(pixels.subarray(y * width, y * width + w), y * newWidth);
  }
  return out;
}
