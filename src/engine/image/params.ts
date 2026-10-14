import { clampInt } from '../../core/limits.ts';

export type FitMode = 'contain' | 'cover' | 'stretch' | 'original';
export type DitherMode =
  'threshold' | 'floyd-steinberg' | 'atkinson' | 'sierra-lite' | 'bayer4' | 'bayer8';
export type Rotation = 0 | 90 | 180 | 270;

export const FIT_MODES: readonly FitMode[] = ['contain', 'cover', 'stretch', 'original'];
export const DITHER_MODES: readonly DitherMode[] = [
  'threshold',
  'floyd-steinberg',
  'atkinson',
  'sierra-lite',
  'bayer4',
  'bayer8',
];
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

export interface ImageParams {
  readonly fit: FitMode;
  /** Escala adicional en %, 10–400. */
  readonly scalePercent: number;
  /** Desplazamiento en píxeles del lienzo, ±512. */
  readonly offsetX: number;
  readonly offsetY: number;
  readonly rotation: Rotation;
  readonly flipH: boolean;
  readonly flipV: boolean;
  /** Color que reemplaza la transparencia. */
  readonly background: 'white' | 'black';
  /** Niveles de entrada, 0–254 y 1–255 (negro < blanco). */
  readonly blackPoint: number;
  readonly whitePoint: number;
  /** Gamma en centésimas, 20–300 (1,00 = 100). */
  readonly gammaCenti: number;
  /** −100 … 100. */
  readonly brightness: number;
  /** −100 … 100. */
  readonly contrast: number;
  /** Umbral 0–255. */
  readonly threshold: number;
  readonly dither: DitherMode;
  /** Qué tonos encienden el píxel. */
  readonly litFrom: 'dark' | 'light';
  /** Invierte los tonos antes de cuantizar. */
  readonly invert: boolean;
}

export const DEFAULT_IMAGE_PARAMS: ImageParams = Object.freeze({
  fit: 'contain',
  scalePercent: 100,
  offsetX: 0,
  offsetY: 0,
  rotation: 0,
  flipH: false,
  flipV: false,
  background: 'white',
  blackPoint: 0,
  whitePoint: 255,
  gammaCenti: 100,
  brightness: 0,
  contrast: 0,
  threshold: 128,
  dither: 'floyd-steinberg',
  litFrom: 'dark',
  invert: false,
});

/** Lleva cualquier entrada a parámetros válidos (sin NaN, en rango). */
export function sanitizeImageParams(
  input: Partial<Record<keyof ImageParams, unknown>>,
): ImageParams {
  const d = DEFAULT_IMAGE_PARAMS;
  const num = (v: unknown, min: number, max: number, def: number) =>
    typeof v === 'number' ? clampInt(v, min, max, def) : def;
  const pick = <T>(v: unknown, allowed: readonly T[], def: T): T =>
    allowed.includes(v as T) ? (v as T) : def;
  let blackPoint = num(input.blackPoint, 0, 254, d.blackPoint);
  let whitePoint = num(input.whitePoint, 1, 255, d.whitePoint);
  if (blackPoint >= whitePoint) {
    blackPoint = Math.min(blackPoint, 254);
    whitePoint = blackPoint + 1;
  }
  return {
    fit: pick(input.fit, FIT_MODES, d.fit),
    scalePercent: num(input.scalePercent, 10, 400, d.scalePercent),
    offsetX: num(input.offsetX, -512, 512, d.offsetX),
    offsetY: num(input.offsetY, -512, 512, d.offsetY),
    rotation: pick(input.rotation, ROTATIONS, d.rotation),
    flipH: input.flipH === true,
    flipV: input.flipV === true,
    background: pick(input.background, ['white', 'black'] as const, d.background),
    blackPoint,
    whitePoint,
    gammaCenti: num(input.gammaCenti, 20, 300, d.gammaCenti),
    brightness: num(input.brightness, -100, 100, d.brightness),
    contrast: num(input.contrast, -100, 100, d.contrast),
    threshold: num(input.threshold, 0, 255, d.threshold),
    dither: pick(input.dither, DITHER_MODES, d.dither),
    litFrom: pick(input.litFrom, ['dark', 'light'] as const, d.litFrom),
    invert: input.invert === true,
  };
}
