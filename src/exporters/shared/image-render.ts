import { hexToRgb, resolveColors } from '../../core/appearance.ts';
import { LIMITS } from '../../core/limits.ts';
import type { Project } from '../../core/project.ts';
import type { DisplayProfile } from '../../device-profiles/index.ts';
import type { Rgb } from '../encoders/png.ts';
import type { Diagnostic, OptionField } from '../types.ts';

/**
 * Representación de fotogramas como imágenes indexadas: 0 = apagado,
 * 1 = encendido, 2 = separación entre caracteres (color del cristal).
 */

export type ColorMode = 'lcd' | 'mono';

export interface ImageLayout {
  readonly scale: number;
  /** Separación de un píxel (escalado) entre celdas de caracteres. */
  readonly cellGap: boolean;
}

export function imagePalette(project: Project, mode: ColorMode): Rgb[] {
  if (mode === 'mono')
    return [
      [255, 255, 255],
      [0, 0, 0],
      [255, 255, 255],
    ];
  const c = resolveColors(project.appearance);
  return [hexToRgb(c.off), hexToRgb(c.on), hexToRgb(c.screen)];
}

export function frameImageSize(
  project: Project,
  profile: DisplayProfile,
  layout: ImageLayout,
): { width: number; height: number } {
  const s = layout.scale;
  if (layout.cellGap && profile.kind === 'character') {
    return {
      width: project.width * s + (profile.columns - 1) * s,
      height: project.height * s + (profile.rows - 1) * s,
    };
  }
  return { width: project.width * s, height: project.height * s };
}

/** Escribe un fotograma en `target` (de ancho `stride`) en la posición (ox, oy). */
export function drawFrameIndices(
  pixels: Uint8Array,
  project: Project,
  profile: DisplayProfile,
  layout: ImageLayout,
  target: Uint8Array,
  stride: number,
  ox: number,
  oy: number,
): void {
  const { width, height } = project;
  const s = layout.scale;
  const gap = layout.cellGap && profile.kind === 'character';
  const size = frameImageSize(project, profile, layout);
  if (gap) {
    for (let y = 0; y < size.height; y++)
      target.fill(2, (oy + y) * stride + ox, (oy + y) * stride + ox + size.width);
  }
  for (let y = 0; y < height; y++) {
    const py = oy + y * s + (gap ? Math.floor(y / 8) * s : 0);
    for (let x = 0; x < width; x++) {
      const px = ox + x * s + (gap ? Math.floor(x / 5) * s : 0);
      const v = pixels[y * width + x] ? 1 : 0;
      for (let dy = 0; dy < s; dy++) {
        const row = (py + dy) * stride + px;
        target.fill(v, row, row + s);
      }
    }
  }
}

export function validateImageSize(width: number, height: number): Diagnostic[] {
  if (
    width > LIMITS.exportMaxImageSide ||
    height > LIMITS.exportMaxImageSide ||
    width * height > LIMITS.exportMaxImagePixels
  ) {
    return [
      {
        severity: 'error',
        code: 'image.exportTooLarge',
        params: { width, height, max: LIMITS.exportMaxImagePixels },
      },
    ];
  }
  return [];
}

export function scaleField(): OptionField {
  return {
    kind: 'number',
    key: 'scale',
    labelKey: 'export.option.scale',
    min: 1,
    max: LIMITS.exportMaxScale,
    step: 1,
  };
}

export function colorField(): OptionField {
  return {
    kind: 'select',
    key: 'colors',
    labelKey: 'export.option.colors',
    choices: [
      { value: 'lcd', labelKey: 'export.colors.lcd' },
      { value: 'mono', labelKey: 'export.colors.mono' },
    ],
  };
}

export function cellGapField(profile: DisplayProfile): OptionField[] {
  return profile.kind === 'character'
    ? [{ kind: 'boolean', key: 'cellGap', labelKey: 'export.option.cellGap' }]
    : [];
}
