import type { GraphicProfile } from '../device-profiles/index.ts';
import {
  AVR_GUARD,
  boardField,
  estimateAvr,
  formatI2c,
  resolveBoard,
  validateAvr,
} from './shared/avr.ts';
import { playbackParts } from './shared/arduino-playback.ts';
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
import { packRowsMsb, rowStride } from './shared/packing.ts';
import { sanitizeFileBaseName } from '../core/names.ts';
import { LIMITS } from '../core/limits.ts';
import type { Diagnostic, ExportContext, Exporter, OptionField } from './types.ts';

/**
 * Adafruit_GFX `drawBitmap`: filas, MSB primero (bit 7 = píxel izquierdo),
 * cada fila alineada a byte.
 *
 * PROGMEM es obligatorio: la sobrecarga `drawBitmap(x, y, const uint8_t[], …)`
 * lee siempre con `pgm_read_byte`, así que una tabla en RAM se leería mal.
 */

export interface AdafruitOptions {
  readonly frames: FrameScope;
  readonly board: string;
  readonly identifier: string;
  /** Boceto completo para SSD1306 por I²C (solo perfiles SSD1306). */
  readonly sketch: boolean;
  readonly i2cAddress: number;
}

function graphic(ctx: ExportContext): GraphicProfile {
  if (ctx.profile.kind !== 'graphic') throw new Error('Perfil no gráfico');
  return ctx.profile;
}

export function canSketchSsd1306(profile: GraphicProfile): boolean {
  return profile.controller === 'SSD1306' && profile.fixedSize !== null;
}

export function i2cAddressField(profile: GraphicProfile): OptionField {
  return {
    kind: 'select',
    key: 'i2cAddress',
    labelKey: 'export.option.i2cAddress',
    choices: profile.i2cAddresses.map((a) => ({
      value: String(a),
      labelKey: `literal:${formatI2c(a)}`,
    })),
    hintKey: 'export.hint.ssd1306Address',
  };
}

function framesData(ctx: ExportContext, scope: FrameScope) {
  const indices = selectedFrames(ctx, scope);
  const { width, height } = ctx.project;
  return {
    indices,
    bytes: indices.map((i) => packRowsMsb(ctx.project.frames[i]!.pixels, width, height)),
    durations: indices.map((i) => ctx.project.frames[i]!.durationMs),
    labels: indices.map((i) => `Fotograma ${i + 1}`),
  };
}

export const adafruitGfxExporter: Exporter<AdafruitOptions> = {
  id: 'adafruit-gfx',
  labelKey: 'exporter.adafruit-gfx',
  descriptionKey: 'exporter.adafruit-gfx.description',
  category: 'code',
  stability: 'stable',
  extension: '.h',
  orientation: 'rows',
  bitOrder: 'msb-first',
  constraintKeys: ['constraint.graphicOnly', 'constraint.progmemRequired', 'constraint.avrOnly'],
  supports: (profile) => profile.kind === 'graphic',

  defaults(ctx) {
    const profile = graphic(ctx);
    return {
      frames: 'all',
      board: 'arduino-uno',
      identifier: defaultIdentifier(ctx),
      sketch: canSketchSsd1306(profile),
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
      sketch: canSketchSsd1306(profile) && pickBool(r['sketch'], d.sketch),
      i2cAddress: profile.i2cAddresses.includes(address) ? address : d.i2cAddress,
    };
  },

  fields(ctx, options) {
    const profile = graphic(ctx);
    const fields: OptionField[] = [frameScopeField(), boardField(), identifierField()];
    fields.push({
      kind: 'boolean',
      key: 'progmem',
      labelKey: 'export.option.progmem',
      locked: true,
      hintKey: 'export.hint.progmemRequiredGfx',
    });
    if (canSketchSsd1306(profile)) {
      fields.push({ kind: 'boolean', key: 'sketch', labelKey: 'export.option.sketchSsd1306' });
      if (options.sketch) fields.push(i2cAddressField(profile));
    }
    return fields;
  },

  estimate(ctx, options) {
    const board = resolveBoard(options.board);
    const count = selectedFrames(ctx, options.frames).length;
    const perFrame = rowStride(ctx.project.width) * ctx.project.height;
    const data = graphicTableBytes(perFrame, count);
    const avr = estimateAvr(board, options.sketch ? 'adafruit-ssd1306' : 'none', {
      progmemBytes: data,
      ramDataBytes: 0,
      largestObjectBytes: perFrame,
      heapBytes: options.sketch ? (ctx.project.width * ctx.project.height) / 8 : 0,
    });
    return { dataBytes: data, ...avr, outputBytes: estimateTextBytes(data, count) };
  },

  validate(ctx, options) {
    const out: Diagnostic[] = [...validateIdentifier(options.identifier)];
    const board = resolveBoard(options.board);
    const count = selectedFrames(ctx, options.frames).length;
    const perFrame = rowStride(ctx.project.width) * ctx.project.height;
    const data = graphicTableBytes(perFrame, count);
    out.push(
      ...validateAvr(board, options.sketch ? 'adafruit-ssd1306' : 'none', {
        progmemBytes: data,
        ramDataBytes: 0,
        largestObjectBytes: perFrame,
        heapBytes: options.sketch ? (ctx.project.width * ctx.project.height) / 8 : 0,
      }),
    );
    out.push(...validateTextSize(estimateTextBytes(data, count)));
    if (options.sketch) {
      out.push({ severity: 'info', code: 'export.info.ssd1306Transfer' });
    }
    return out;
  },

  run(ctx, options) {
    const id = options.identifier;
    const { width, height } = ctx.project;
    const f = framesData(ctx, options.frames);
    const count = f.indices.length;
    const tables = graphicTables({
      prefix: id,
      storage: 'PROGMEM',
      frames: f.bytes,
      durations: f.durations,
      frameLabels: f.labels,
    });
    const base = sanitizeFileBaseName(id);

    if (!options.sketch) {
      const guard = `${id.toUpperCase()}_H`;
      const content = `${sourceHeader(ctx, 'Mapas de bits para Adafruit_GFX drawBitmap()', count, [
        'Formato: filas de arriba abajo, 1 bit por píxel, bit 7 = píxel izquierdo (MSB primero).',
        `Cada fila ocupa ${rowStride(width)} bytes; los bits sobrantes valen 0.`,
        'Las tablas están en PROGMEM: drawBitmap() las lee con pgm_read_byte().',
        `Uso: display.drawBitmap(0, 0, (const uint8_t *)pgm_read_ptr(&${id}_frames[i]),`,
        `     ${id.toUpperCase()}_WIDTH, ${id.toUpperCase()}_HEIGHT, color);`,
        `     delay(pgm_read_word(&${id}_durations_ms[i]));`,
      ])}
#ifndef ${guard}
#define ${guard}

#include <stdint.h>
#include <avr/pgmspace.h>

#define ${id.toUpperCase()}_WIDTH ${width}
#define ${id.toUpperCase()}_HEIGHT ${height}
#define ${id.toUpperCase()}_FRAME_COUNT ${count}u
#define ${id.toUpperCase()}_BYTES_PER_FRAME ${rowStride(width) * height}u

${tables}
#endif
`;
      return [textFile(`${base}.h`, content, 'text/x-c')];
    }

    const play = playbackParts(count, ctx.project.loopMode, true);
    const content = `${sourceHeader(
      ctx,
      'Animación para SSD1306 con Adafruit_SSD1306 y Adafruit_GFX',
      count,
      [
        'Bibliotecas: Adafruit SSD1306 y Adafruit GFX Library (gestor de bibliotecas de Arduino).',
        `Conexión I2C, dirección ${formatI2c(options.i2cAddress)}.`,
      ],
    )}
${AVR_GUARD}
#include <Wire.h>
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <avr/pgmspace.h>
${play.includes}
static const int16_t IMAGE_WIDTH = ${width};
static const int16_t IMAGE_HEIGHT = ${height};
static const uint16_t FRAME_COUNT = ${count};

${tables}
Adafruit_SSD1306 display(${width}, ${height}, &Wire, -1);

${play.helpers}
static uint16_t frameDurationMs(uint16_t index) {
  return pgm_read_word(&${id}_durations_ms[index]);
}

static void showFrame(uint16_t index) {
  const uint8_t *bitmap = (const uint8_t *)pgm_read_ptr(&${id}_frames[index]);
  display.clearDisplay();
  display.drawBitmap(0, 0, bitmap, IMAGE_WIDTH, IMAGE_HEIGHT, SSD1306_WHITE);
  display.display();
}

void setup() {
  if (!display.begin(SSD1306_SWITCHCAPVCC, ${formatI2c(options.i2cAddress)})) {
    // Sin memoria para el búfer de pantalla: no hay nada que mostrar.
    holdLastFrame();
  }
${play.setupTail}}

${play.loop}`;
    return [textFile(`${base}.ino`, content, 'text/x-arduino')];
  },
};
