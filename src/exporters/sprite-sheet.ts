import { LIMITS } from '../core/limits.ts';
import { sanitizeFileBaseName } from '../core/names.ts';
import { encodeIndexedPng } from './encoders/png.ts';
import { textFile } from './shared/c-source.ts';
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
import type { ExportContext, Exporter, ExportFile } from './types.ts';

/** Hoja de sprites PNG con todos los fotogramas y, opcionalmente, metadatos JSON. */

export type SheetLayout = 'horizontal' | 'vertical' | 'grid';

export interface SpriteSheetOptions {
  readonly scale: number;
  readonly colors: ColorMode;
  readonly cellGap: boolean;
  readonly layout: SheetLayout;
  readonly metadata: boolean;
}

export function sheetGeometry(ctx: ExportContext, o: SpriteSheetOptions) {
  const n = ctx.project.frames.length;
  const cell = frameImageSize(ctx.project, ctx.profile, o);
  const columns =
    o.layout === 'horizontal' ? n : o.layout === 'vertical' ? 1 : Math.ceil(Math.sqrt(n));
  const rows = Math.ceil(n / columns);
  return { cell, columns, rows, width: cell.width * columns, height: cell.height * rows };
}

export const spriteSheetExporter: Exporter<SpriteSheetOptions> = {
  id: 'sprite-sheet',
  labelKey: 'exporter.sprite-sheet',
  descriptionKey: 'exporter.sprite-sheet.description',
  category: 'image',
  contents: ['animation'],
  stability: 'stable',
  extension: '.png',
  orientation: 'image',
  bitOrder: 'none',
  constraintKeys: ['constraint.allFrames', 'constraint.imageSize'],
  supports: () => true,

  defaults(ctx) {
    return {
      scale: 4,
      colors: 'lcd',
      cellGap: ctx.profile.kind === 'character',
      layout: 'grid',
      metadata: true,
    };
  },

  normalize(raw, ctx) {
    const d = this.defaults(ctx);
    const r = asRecord(raw);
    return {
      scale: pickInt(r['scale'], 1, LIMITS.exportMaxScale, d.scale),
      colors: pickEnum(r['colors'], ['lcd', 'mono'] as const, d.colors),
      cellGap: ctx.profile.kind === 'character' && pickBool(r['cellGap'], d.cellGap),
      layout: pickEnum(r['layout'], ['horizontal', 'vertical', 'grid'] as const, d.layout),
      metadata: pickBool(r['metadata'], d.metadata),
    };
  },

  fields(ctx) {
    return [
      scaleField(),
      colorField(),
      ...cellGapField(ctx.profile),
      {
        kind: 'select',
        key: 'layout',
        labelKey: 'export.option.layout',
        choices: [
          { value: 'grid', labelKey: 'export.layout.grid' },
          { value: 'horizontal', labelKey: 'export.layout.horizontal' },
          { value: 'vertical', labelKey: 'export.layout.vertical' },
        ],
      },
      { kind: 'boolean', key: 'metadata', labelKey: 'export.option.metadata' },
    ];
  },

  estimate(ctx, options) {
    const g = sheetGeometry(ctx, options);
    return { dataBytes: g.width * g.height, outputBytes: Math.ceil((g.width * g.height) / 8) };
  },

  validate(ctx, options) {
    const g = sheetGeometry(ctx, options);
    return validateImageSize(g.width, g.height);
  },

  run(ctx, options) {
    const g = sheetGeometry(ctx, options);
    const indices = new Uint8Array(g.width * g.height);
    const frames: { x: number; y: number; w: number; h: number; durationMs: number }[] = [];
    ctx.project.frames.forEach((frame, i) => {
      const x = (i % g.columns) * g.cell.width;
      const y = Math.floor(i / g.columns) * g.cell.height;
      drawFrameIndices(frame.pixels, ctx.project, ctx.profile, options, indices, g.width, x, y);
      frames.push({ x, y, w: g.cell.width, h: g.cell.height, durationMs: frame.durationMs });
    });
    const palette = imagePalette(ctx.project, options.colors);
    const base = sanitizeFileBaseName(ctx.project.name);
    const files: ExportFile[] = [
      {
        name: `${base}_sprites.png`,
        mime: 'image/png',
        data: encodeIndexedPng(
          g.width,
          g.height,
          indices,
          options.cellGap ? palette : palette.slice(0, 2),
        ),
        text: false,
      },
    ];
    if (options.metadata) {
      const meta = {
        image: `${base}_sprites.png`,
        width: g.width,
        height: g.height,
        frameWidth: g.cell.width,
        frameHeight: g.cell.height,
        scale: options.scale,
        loop: ctx.project.loopMode,
        frames,
      };
      files.push(
        textFile(`${base}_sprites.json`, JSON.stringify(meta, null, 2), 'application/json'),
      );
    }
    return files;
  },
};
