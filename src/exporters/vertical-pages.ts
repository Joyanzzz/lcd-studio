import { LIMITS } from '../core/limits.ts';
import { sanitizeFileBaseName } from '../core/names.ts';
import { boardField, estimateAvr, resolveBoard, validateAvr } from './shared/avr.ts';
import { sourceHeader, textFile } from './shared/c-source.ts';
import { estimateTextBytes, graphicTableBytes, graphicTables } from './shared/graphic-data.ts';
import {
  asRecord,
  defaultIdentifier,
  FRAME_SCOPES,
  frameScopeField,
  identifierField,
  pickBool,
  pickEnum,
  pickString,
  selectedFrames,
  validateIdentifier,
  validateTextSize,
  type FrameScope,
} from './shared/options.ts';
import { packPages, pageCount } from './shared/packing.ts';
import type { Diagnostic, ExportContext, Exporter } from './types.ts';

/**
 * Páginas verticales (organización de la memoria de SSD1306, PCD8544 y
 * KS0108): cada byte son 8 píxeles de una columna con el bit 0 arriba.
 * Orden: página 0 (filas 0–7) de izquierda a derecha, después la página 1…
 * Genera solo datos (`.h`); no incluye código de pantalla.
 */

export interface PagesOptions {
  readonly frames: FrameScope;
  readonly board: string;
  readonly identifier: string;
  readonly progmem: boolean;
}

function usage(ctx: ExportContext, o: PagesOptions) {
  const count = selectedFrames(ctx, o.frames).length;
  const perFrame = pageCount(ctx.project.height) * ctx.project.width;
  const data = graphicTableBytes(perFrame, count);
  return {
    count,
    data,
    usage: {
      progmemBytes: o.progmem ? data : 0,
      ramDataBytes: o.progmem ? 0 : data,
      largestObjectBytes: perFrame,
    },
  };
}

const CONTROLLER_NOTES: Readonly<Record<string, string>> = {
  SSD1306:
    'SSD1306: en modo de direccionamiento horizontal (0x20, 0x00) envía las páginas en este orden.',
  PCD8544: 'PCD8544: con direccionamiento horizontal (V = 0) envía los bytes en este orden.',
  KS0108:
    'KS0108: cada controlador cubre 64 columnas; envía las columnas 0–63 al chip 1 y 64–127 al chip 2 por página.',
};

export const verticalPagesExporter: Exporter<PagesOptions> = {
  id: 'vertical-pages',
  labelKey: 'exporter.vertical-pages',
  descriptionKey: 'exporter.vertical-pages.description',
  category: 'code',
  stability: 'stable',
  extension: '.h',
  orientation: 'vertical-pages',
  bitOrder: 'lsb-first',
  constraintKeys: ['constraint.graphicOnly', 'constraint.dataOnly'],
  supports: (profile) => profile.kind === 'graphic',

  defaults(ctx) {
    return {
      frames: 'all',
      board: 'arduino-uno',
      identifier: defaultIdentifier(ctx),
      progmem: true,
    };
  },

  normalize(raw, ctx) {
    const d = this.defaults(ctx);
    const r = asRecord(raw);
    return {
      frames: pickEnum(r['frames'], FRAME_SCOPES, d.frames),
      board: resolveBoard(r['board']).id,
      identifier: pickString(r['identifier'], LIMITS.nameMaxLength * 2, d.identifier),
      progmem: pickBool(r['progmem'], d.progmem),
    };
  },

  fields() {
    return [
      frameScopeField(),
      boardField(),
      identifierField(),
      {
        kind: 'boolean',
        key: 'progmem',
        labelKey: 'export.option.progmem',
        hintKey: 'export.hint.progmemData',
      },
    ];
  },

  estimate(ctx, options) {
    const u = usage(ctx, options);
    const avr = estimateAvr(resolveBoard(options.board), 'none', u.usage);
    return { dataBytes: u.data, ...avr, outputBytes: estimateTextBytes(u.data, u.count) };
  },

  validate(ctx, options) {
    const u = usage(ctx, options);
    const out: Diagnostic[] = [...validateIdentifier(options.identifier)];
    out.push(...validateAvr(resolveBoard(options.board), 'none', u.usage));
    out.push(...validateTextSize(estimateTextBytes(u.data, u.count)));
    return out;
  },

  run(ctx, options) {
    const id = options.identifier;
    const ID = id.toUpperCase();
    const { width, height } = ctx.project;
    const indices = selectedFrames(ctx, options.frames);
    const pages = pageCount(height);
    const controller = ctx.profile.kind === 'graphic' ? ctx.profile.controller : null;
    const tables = graphicTables({
      prefix: id,
      storage: options.progmem ? 'PROGMEM' : '',
      frames: indices.map((i) => packPages(ctx.project.frames[i]!.pixels, width, height)),
      durations: indices.map((i) => ctx.project.frames[i]!.durationMs),
      frameLabels: indices.map((i) => `Fotograma ${i + 1}`),
    });
    const notes = [
      'Formato: páginas de 8 filas; cada byte es una columna de 8 píxeles, bit 0 arriba.',
      `Orden: página 0 (filas 0-7) de izquierda a derecha, luego página 1... (${pages} páginas x ${width} columnas).`,
      height % 8 === 0
        ? 'La altura es múltiplo de 8: no hay bits de relleno.'
        : `La altura (${height}) no es múltiplo de 8: los bits sobrantes de la última página valen 0.`,
      options.progmem
        ? 'Tablas en PROGMEM: léelas con pgm_read_byte() / pgm_read_ptr() / pgm_read_word().'
        : 'Tablas en RAM: léelas directamente, sin pgm_read_*.',
    ];
    if (controller && CONTROLLER_NOTES[controller]) notes.push(CONTROLLER_NOTES[controller]);
    const content = `${sourceHeader(ctx, 'Mapas de bits en páginas verticales', indices.length, notes)}
#ifndef ${ID}_H
#define ${ID}_H

#include <stdint.h>
${options.progmem ? '#include <avr/pgmspace.h>\n' : ''}
#define ${ID}_WIDTH ${width}
#define ${ID}_HEIGHT ${height}
#define ${ID}_PAGES ${pages}
#define ${ID}_FRAME_COUNT ${indices.length}u
#define ${ID}_BYTES_PER_FRAME ${pages * width}u

${tables}
#endif
`;
    return [textFile(`${sanitizeFileBaseName(id)}.h`, content, 'text/x-c')];
  },
};
