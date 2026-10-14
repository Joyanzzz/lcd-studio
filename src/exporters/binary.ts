import { sanitizeFileBaseName } from '../core/names.ts';
import {
  asRecord,
  FRAME_SCOPES,
  frameScopeField,
  pickEnum,
  selectedFrames,
  type FrameScope,
} from './shared/options.ts';
import { packPages, packRowsLsb, packRowsMsb, pageCount, rowStride } from './shared/packing.ts';
import type { Exporter } from './types.ts';

/**
 * Datos binarios crudos (`.bin`): los fotogramas seleccionados uno tras otro,
 * sin cabecera, con el empaquetado elegido. Útil para memorias externas o
 * tarjetas SD.
 */

export type BinaryPacking = 'rows-msb' | 'rows-lsb' | 'pages';

export interface BinaryOptions {
  readonly frames: FrameScope;
  readonly packing: BinaryPacking;
}

export function bytesPerFrame(width: number, height: number, packing: BinaryPacking): number {
  return packing === 'pages' ? pageCount(height) * width : rowStride(width) * height;
}

const PACKERS = { 'rows-msb': packRowsMsb, 'rows-lsb': packRowsLsb, pages: packPages } as const;

export const binaryExporter: Exporter<BinaryOptions> = {
  id: 'binary',
  labelKey: 'exporter.binary',
  descriptionKey: 'exporter.binary.description',
  category: 'data',
  stability: 'stable',
  extension: '.bin',
  orientation: 'rows',
  bitOrder: 'msb-first',
  constraintKeys: ['constraint.noHeader'],
  supports: () => true,

  defaults() {
    return { frames: 'all', packing: 'rows-msb' };
  },

  normalize(raw, ctx) {
    const d = this.defaults(ctx);
    const r = asRecord(raw);
    return {
      frames: pickEnum(r['frames'], FRAME_SCOPES, d.frames),
      packing: pickEnum(r['packing'], ['rows-msb', 'rows-lsb', 'pages'] as const, d.packing),
    };
  },

  fields() {
    return [
      frameScopeField(),
      {
        kind: 'select',
        key: 'packing',
        labelKey: 'export.option.packing',
        choices: [
          { value: 'rows-msb', labelKey: 'export.packing.rowsMsb' },
          { value: 'rows-lsb', labelKey: 'export.packing.rowsLsb' },
          { value: 'pages', labelKey: 'export.packing.pages' },
        ],
      },
    ];
  },

  estimate(ctx, options) {
    const n = selectedFrames(ctx, options.frames).length;
    const bytes = n * bytesPerFrame(ctx.project.width, ctx.project.height, options.packing);
    return { dataBytes: bytes, outputBytes: bytes };
  },

  validate(ctx, options) {
    return [
      {
        severity: 'info',
        code: 'binary.layout',
        params: {
          bytes: bytesPerFrame(ctx.project.width, ctx.project.height, options.packing),
          frames: selectedFrames(ctx, options.frames).length,
        },
      },
    ];
  },

  run(ctx, options) {
    const { width, height } = ctx.project;
    const indices = selectedFrames(ctx, options.frames);
    const per = bytesPerFrame(width, height, options.packing);
    const out = new Uint8Array(per * indices.length);
    indices.forEach((i, k) =>
      out.set(PACKERS[options.packing](ctx.project.frames[i]!.pixels, width, height), k * per),
    );
    return [
      {
        name: `${sanitizeFileBaseName(ctx.project.name)}_${options.packing}.bin`,
        mime: 'application/octet-stream',
        data: out,
        text: false,
      },
    ];
  },
};
