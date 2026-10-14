import { sanitizeFileBaseName } from '../core/names.ts';
import { textFile } from './shared/c-source.ts';
import {
  asRecord,
  FRAME_SCOPES,
  pickEnum,
  selectedFrames,
  validateTextSize,
  type FrameScope,
} from './shared/options.ts';
import type { Exporter } from './types.ts';

/** ASCII art: `#` = encendido, `.` = apagado. Varios fotogramas se separan con una línea en blanco. */

export interface AsciiOptions {
  readonly frames: FrameScope;
}

function estimateBytes(width: number, height: number, frames: number): number {
  return frames * ((width + 1) * height + 40);
}

export const asciiExporter: Exporter<AsciiOptions> = {
  id: 'ascii',
  labelKey: 'exporter.ascii',
  descriptionKey: 'exporter.ascii.description',
  category: 'data',
  contents: ['frame', 'selection', 'animation'],
  stability: 'stable',
  extension: '.txt',
  orientation: 'text',
  bitOrder: 'none',
  constraintKeys: [],
  supports: () => true,

  defaults() {
    return { frames: 'current' };
  },

  normalize(raw, ctx) {
    return { frames: pickEnum(asRecord(raw)['frames'], FRAME_SCOPES, this.defaults(ctx).frames) };
  },

  fields() {
    return [];
  },

  estimate(ctx, options) {
    const n = selectedFrames(ctx, options.frames).length;
    const bytes = estimateBytes(ctx.project.width, ctx.project.height, n);
    return { dataBytes: bytes, outputBytes: bytes };
  },

  validate(ctx, options) {
    const n = selectedFrames(ctx, options.frames).length;
    return validateTextSize(estimateBytes(ctx.project.width, ctx.project.height, n));
  },

  run(ctx, options) {
    const { width, height } = ctx.project;
    const indices = selectedFrames(ctx, options.frames);
    const blocks = indices.map((i) => {
      const frame = ctx.project.frames[i]!;
      const lines: string[] = [];
      if (indices.length > 1) lines.push(`; fotograma ${i + 1} (${frame.durationMs} ms)`);
      for (let y = 0; y < height; y++) {
        let row = '';
        for (let x = 0; x < width; x++) row += frame.pixels[y * width + x] ? '#' : '.';
        lines.push(row);
      }
      return lines.join('\n');
    });
    return [textFile(`${sanitizeFileBaseName(ctx.project.name)}.txt`, blocks.join('\n\n'))];
  },
};
