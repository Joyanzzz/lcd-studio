import { LIMITS } from '../core/limits.ts';
import { sanitizeFileBaseName } from '../core/names.ts';
import type { GraphicProfile } from '../device-profiles/index.ts';
import { canSketchSsd1306, i2cAddressField } from './adafruit-gfx.ts';
import { playbackParts } from './shared/arduino-playback.ts';
import {
  AVR_GUARD,
  boardField,
  estimateAvr,
  formatI2c,
  resolveBoard,
  validateAvr,
} from './shared/avr.ts';
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
  pickInt,
  pickString,
  selectedFrames,
  validateIdentifier,
  validateTextSize,
  type FrameScope,
} from './shared/options.ts';
import { packRowsLsb, rowStride } from './shared/packing.ts';
import type { Diagnostic, ExportContext, Exporter, OptionField } from './types.ts';

/**
 * U8g2 / XBM: filas, LSB primero (bit 0 = píxel izquierdo).
 * Con PROGMEM las tablas usan `U8X8_PROGMEM` y se dibujan con `drawXBMP()`;
 * sin PROGMEM quedan en RAM y se dibujan con `drawXBM()` (no se usa
 * `pgm_read_*`).
 */

export interface U8g2Options {
  readonly frames: FrameScope;
  readonly board: string;
  readonly identifier: string;
  readonly progmem: boolean;
  readonly sketch: boolean;
  readonly i2cAddress: number;
}

function graphic(ctx: ExportContext): GraphicProfile {
  if (ctx.profile.kind !== 'graphic') throw new Error('Perfil no gráfico');
  return ctx.profile;
}

/** Constructor U8g2 de página (búfer de 128 bytes) para cada SSD1306. */
const U8G2_CONSTRUCTORS: Readonly<Record<string, string>> = {
  'ssd1306-128x64': 'U8G2_SSD1306_128X64_NONAME_1_HW_I2C',
  'ssd1306-128x32': 'U8G2_SSD1306_128X32_UNIVISION_1_HW_I2C',
};

function usage(ctx: ExportContext, o: U8g2Options) {
  const count = selectedFrames(ctx, o.frames).length;
  const perFrame = rowStride(ctx.project.width) * ctx.project.height;
  const data = graphicTableBytes(perFrame, count);
  return {
    count,
    data,
    usage: {
      progmemBytes: o.progmem ? data : 0,
      ramDataBytes: o.progmem ? 0 : data,
      largestObjectBytes: perFrame,
    },
    library: o.sketch ? ('u8g2-page' as const) : ('none' as const),
  };
}

export const u8g2XbmExporter: Exporter<U8g2Options> = {
  id: 'u8g2-xbm',
  labelKey: 'exporter.u8g2-xbm',
  descriptionKey: 'exporter.u8g2-xbm.description',
  category: 'code',
  stability: 'stable',
  extension: '.h',
  orientation: 'rows',
  bitOrder: 'lsb-first',
  constraintKeys: ['constraint.graphicOnly', 'constraint.avrOnly'],
  supports: (profile) => profile.kind === 'graphic',

  defaults(ctx) {
    const profile = graphic(ctx);
    return {
      frames: 'all',
      board: 'arduino-uno',
      identifier: defaultIdentifier(ctx),
      progmem: true,
      sketch: canSketchSsd1306(profile) && U8G2_CONSTRUCTORS[profile.id] !== undefined,
      i2cAddress: profile.i2cAddresses[0] ?? 0x3c,
    };
  },

  normalize(raw, ctx) {
    const d = this.defaults(ctx);
    const r = asRecord(raw);
    const profile = graphic(ctx);
    const address = pickInt(Number(r['i2cAddress']), 0, 127, d.i2cAddress);
    return {
      frames: pickEnum(r['frames'], FRAME_SCOPES, d.frames),
      board: resolveBoard(r['board']).id,
      identifier: pickString(r['identifier'], LIMITS.nameMaxLength * 2, d.identifier),
      progmem: pickBool(r['progmem'], d.progmem),
      sketch: U8G2_CONSTRUCTORS[profile.id] !== undefined && pickBool(r['sketch'], d.sketch),
      i2cAddress: profile.i2cAddresses.includes(address) ? address : d.i2cAddress,
    };
  },

  fields(ctx, options) {
    const profile = graphic(ctx);
    const fields: OptionField[] = [
      frameScopeField(),
      boardField(),
      identifierField(),
      {
        kind: 'boolean',
        key: 'progmem',
        labelKey: 'export.option.progmem',
        hintKey: 'export.hint.progmemU8g2',
      },
    ];
    if (U8G2_CONSTRUCTORS[profile.id]) {
      fields.push({ kind: 'boolean', key: 'sketch', labelKey: 'export.option.sketchU8g2' });
      if (options.sketch) fields.push(i2cAddressField(profile));
    }
    return fields;
  },

  estimate(ctx, options) {
    const u = usage(ctx, options);
    const avr = estimateAvr(resolveBoard(options.board), u.library, u.usage);
    return { dataBytes: u.data, ...avr, outputBytes: estimateTextBytes(u.data, u.count) };
  },

  validate(ctx, options) {
    const u = usage(ctx, options);
    const out: Diagnostic[] = [...validateIdentifier(options.identifier)];
    out.push(...validateAvr(resolveBoard(options.board), u.library, u.usage));
    out.push(...validateTextSize(estimateTextBytes(u.data, u.count)));
    return out;
  },

  run(ctx, options) {
    const id = options.identifier;
    const ID = id.toUpperCase();
    const { width, height } = ctx.project;
    const indices = selectedFrames(ctx, options.frames);
    const count = indices.length;
    const tables = graphicTables({
      prefix: id,
      storage: options.progmem ? 'U8X8_PROGMEM' : '',
      frames: indices.map((i) => packRowsLsb(ctx.project.frames[i]!.pixels, width, height)),
      durations: indices.map((i) => ctx.project.frames[i]!.durationMs),
      frameLabels: indices.map((i) => `Fotograma ${i + 1}`),
    });
    const base = sanitizeFileBaseName(id);
    const draw = options.progmem ? 'drawXBMP' : 'drawXBM';

    if (!options.sketch) {
      const guard = `${ID}_H`;
      const notes = options.progmem
        ? [
            'Tablas en flash (U8X8_PROGMEM): dibújalas con drawXBMP().',
            `Uso: u8g2.drawXBMP(0, 0, ${ID}_WIDTH, ${ID}_HEIGHT, (const uint8_t *)pgm_read_ptr(&${id}_frames[i]));`,
          ]
        : [
            'Tablas en RAM: dibújalas con drawXBM().',
            `Uso: u8g2.drawXBM(0, 0, ${ID}_WIDTH, ${ID}_HEIGHT, ${id}_frames[i]);`,
          ];
      const content = `${sourceHeader(ctx, 'Mapas de bits XBM para U8g2', count, [
        'Formato: filas de arriba abajo, bit 0 = píxel izquierdo (LSB primero, XBM).',
        `Cada fila ocupa ${rowStride(width)} bytes; los bits sobrantes valen 0.`,
        ...notes,
      ])}
#ifndef ${guard}
#define ${guard}

#include <stdint.h>
${options.progmem ? '#include <U8x8lib.h>\n' : ''}
#define ${ID}_WIDTH ${width}
#define ${ID}_HEIGHT ${height}
#define ${ID}_FRAME_COUNT ${count}u
#define ${ID}_BYTES_PER_FRAME ${rowStride(width) * height}u

${tables}
#endif
`;
      return [textFile(`${base}.h`, content, 'text/x-c')];
    }

    const ctor = U8G2_CONSTRUCTORS[ctx.project.profileId]!;
    const play = playbackParts(count, ctx.project.loopMode);
    const read = options.progmem
      ? {
          duration: `pgm_read_word(&${id}_durations_ms[index])`,
          bitmap: `(const uint8_t *)pgm_read_ptr(&${id}_frames[index])`,
        }
      : { duration: `${id}_durations_ms[index]`, bitmap: `${id}_frames[index]` };
    const content = `${sourceHeader(ctx, 'Animación para SSD1306 con U8g2 (modo página)', count, [
      'Biblioteca: U8g2 (gestor de bibliotecas de Arduino).',
      `Conexión I2C, dirección ${formatI2c(options.i2cAddress)}.`,
      options.progmem ? 'Tablas en flash (U8X8_PROGMEM).' : 'Tablas en RAM (sin PROGMEM).',
    ])}
${AVR_GUARD}
#include <U8g2lib.h>
#include <Wire.h>
${play.includes}
static const uint16_t IMAGE_WIDTH = ${width};
static const uint16_t IMAGE_HEIGHT = ${height};
static const uint16_t FRAME_COUNT = ${count};

${tables}
${ctor} u8g2(U8G2_R0, U8X8_PIN_NONE);

${play.helpers}
static uint16_t frameDurationMs(uint16_t index) {
  return ${read.duration};
}

static void showFrame(uint16_t index) {
  const uint8_t *bitmap = ${read.bitmap};
  u8g2.firstPage();
  do {
    u8g2.${draw}(0, 0, IMAGE_WIDTH, IMAGE_HEIGHT, bitmap);
  } while (u8g2.nextPage());
}

void setup() {
  u8g2.setI2CAddress(${formatI2c(options.i2cAddress)} * 2);
  u8g2.begin();
${play.setupTail}}

${play.loop}`;
    return [textFile(`${base}.ino`, content, 'text/x-arduino')];
  },
};
