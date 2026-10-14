import { LIMITS } from '../core/limits.ts';
import { sanitizeFileBaseName } from '../core/names.ts';
import { encodeIndexedPng } from './encoders/png.ts';
import {
  cellGapField,
  colorField,
  drawFrameIndices,
  frameImageSize,
  imagePalette,
  scaleField,
  validateImageSize,
  type ColorMode,
} from './shared/image-render.ts';
import { asRecord, pickBool, pickEnum, pickInt, selectedFrames } from './shared/options.ts';
import type { Exporter } from './types.ts';

/** PNG del fotograma actual (paleta indexada, determinista). */

export interface PngOptions {
  readonly scale: number;
  readonly colors: ColorMode;
  readonly cellGap: boolean;
}

export const pngExporter: Exporter<PngOptions> = {
  id: 'png',
  labelKey: 'exporter.png',
  descriptionKey: 'exporter.png.description',
  category: 'image',
  stability: 'stable',
  extension: '.png',
  orientation: 'image',
  bitOrder: 'none',
  constraintKeys: ['constraint.currentFrame', 'constraint.imageSize'],
  supports: () => true,

  defaults(ctx) {
    return { scale: 8, colors: 'lcd', cellGap: ctx.profile.kind === 'character' };
  },

  normalize(raw, ctx) {
    const d = this.defaults(ctx);
    const r = asRecord(raw);
    return {
      scale: pickInt(r['scale'], 1, LIMITS.exportMaxScale, d.scale),
      colors: pickEnum(r['colors'], ['lcd', 'mono'] as const, d.colors),
      cellGap: ctx.profile.kind === 'character' && pickBool(r['cellGap'], d.cellGap),
    };
  },

  fields(ctx) {
    return [scaleField(), colorField(), ...cellGapField(ctx.profile)];
  },

  estimate(ctx, options) {
    const size = frameImageSize(ctx.project, ctx.profile, options);
    return {
      dataBytes: size.width * size.height,
      outputBytes: Math.ceil((size.width * size.height) / 8),
    };
  },

  validate(ctx, options) {
    const size = frameImageSize(ctx.project, ctx.profile, options);
    return validateImageSize(size.width, size.height);
  },

  run(ctx, options) {
    const [index] = selectedFrames(ctx, 'current');
    const size = frameImageSize(ctx.project, ctx.profile, options);
    const indices = new Uint8Array(size.width * size.height);
    drawFrameIndices(
      ctx.project.frames[index!]!.pixels,
      ctx.project,
      ctx.profile,
      options,
      indices,
      size.width,
      0,
      0,
    );
    const palette = imagePalette(ctx.project, options.colors);
    const usedPalette = options.cellGap ? palette : palette.slice(0, 2);
    return [
      {
        name: `${sanitizeFileBaseName(ctx.project.name)}_${index! + 1}.png`,
        mime: 'image/png',
        data: encodeIndexedPng(size.width, size.height, indices, usedPalette),
        text: false,
      },
    ];
  },
};
