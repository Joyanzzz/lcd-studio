import { LIMITS } from '../core/limits.ts';
import { sanitizeFileBaseName } from '../core/names.ts';
import { playbackCycle } from '../core/playback.ts';
import { encodeGif } from './encoders/gif.ts';
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
import { asRecord, pickBool, pickEnum, pickInt } from './shared/options.ts';
import type { Diagnostic, Exporter } from './types.ts';

/**
 * GIF animado. Respeta el modo de reproducción del proyecto: bucle e ida y
 * vuelta se repiten indefinidamente (ida y vuelta expande los cuadros); "una
 * vez" no incluye la extensión NETSCAPE y se reproduce una sola vez.
 * El GIF guarda los retardos en centésimas: se redondea a 10 ms y se avisa.
 */

export interface GifOptions {
  readonly scale: number;
  readonly colors: ColorMode;
  readonly cellGap: boolean;
}

export const gifExporter: Exporter<GifOptions> = {
  id: 'gif',
  labelKey: 'exporter.gif',
  descriptionKey: 'exporter.gif.description',
  category: 'image',
  contents: ['animation'],
  stability: 'stable',
  extension: '.gif',
  orientation: 'image',
  bitOrder: 'none',
  constraintKeys: ['constraint.allFrames', 'constraint.gifTiming', 'constraint.imageSize'],
  supports: () => true,

  defaults(ctx) {
    return { scale: 4, colors: 'lcd', cellGap: ctx.profile.kind === 'character' };
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
    const n = playbackCycle(ctx.project.frames.length, ctx.project.loopMode).length;
    return {
      dataBytes: size.width * size.height * n,
      outputBytes: Math.ceil((size.width * size.height * n) / 4),
    };
  },

  validate(ctx, options) {
    const size = frameImageSize(ctx.project, ctx.profile, options);
    // El límite de lado (16 384) ya es menor que el máximo de GIF (65 535).
    const out: Diagnostic[] = [...validateImageSize(size.width, size.height)];
    const n = playbackCycle(ctx.project.frames.length, ctx.project.loopMode).length;
    if (size.width * size.height * n > LIMITS.exportMaxGifTotalPixels) {
      out.push({
        severity: 'error',
        code: 'gif.tooLarge',
        params: { pixels: size.width * size.height * n, max: LIMITS.exportMaxGifTotalPixels },
      });
    }
    const rounded = ctx.project.frames.filter((f) => f.durationMs % 10 !== 0).length;
    if (rounded > 0)
      out.push({ severity: 'warning', code: 'gif.durationRounded', params: { count: rounded } });
    return out;
  },

  run(ctx, options) {
    const size = frameImageSize(ctx.project, ctx.profile, options);
    const cycle = playbackCycle(ctx.project.frames.length, ctx.project.loopMode);
    const rendered = new Map<number, Uint8Array>();
    const frames = cycle.map((i) => {
      let indices = rendered.get(i);
      if (!indices) {
        indices = new Uint8Array(size.width * size.height);
        drawFrameIndices(
          ctx.project.frames[i]!.pixels,
          ctx.project,
          ctx.profile,
          options,
          indices,
          size.width,
          0,
          0,
        );
        rendered.set(i, indices);
      }
      return { indices, delayCs: Math.max(2, Math.round(ctx.project.frames[i]!.durationMs / 10)) };
    });
    const palette = imagePalette(ctx.project, options.colors);
    return [
      {
        name: `${sanitizeFileBaseName(ctx.project.name)}.gif`,
        mime: 'image/gif',
        data: encodeGif(
          size.width,
          size.height,
          options.cellGap ? palette : palette.slice(0, 2),
          frames,
          ctx.project.loopMode !== 'once',
        ),
        text: false,
      },
    ];
  },
};
