import { DEFAULT_MATRIX, type MatrixConfig } from '../core/device.ts';
import { LIMITS } from '../core/limits.ts';
import { sanitizeFileBaseName } from '../core/names.ts';
import { playbackParts } from './shared/arduino-playback.ts';
import {
  AVR_GUARD,
  boardField,
  estimateAvr,
  resolveBoard,
  validateAvr,
  validatePins,
} from './shared/avr.ts';
import { byteLines, hex8, numberLines, sourceHeader, textFile } from './shared/c-source.ts';
import { MAX7219_REG, MATRIX_SIZE, registerBytes } from './shared/max7219.ts';
import {
  asRecord,
  defaultIdentifier,
  FRAME_SCOPES,
  identifierField,
  pickEnum,
  pickInt,
  pickString,
  selectedFrames,
  validateIdentifier,
  validateTextSize,
  type FrameScope,
} from './shared/options.ts';
import type { Diagnostic, ExportContext, Exporter, OptionField } from './types.ts';

/**
 * Matriz de LEDs 8×8 con MAX7219.
 *
 * Los datos de cada fotograma son 8 bytes: el valor de los registros de dígito
 * DIG0…DIG7 (direcciones 0x01…0x08), ya con la orientación física y el
 * cableado del proyecto. El boceto Arduino no necesita bibliotecas: escribe
 * los registros con `shiftOut()` (16 bits por escritura, dirección primero,
 * MSB primero) y CS a nivel bajo durante la escritura.
 *
 * Tiempos: la duración de cada fotograma (ms) solo decide cuándo se cambia de
 * imagen. El refresco físico de los LEDs lo hace el propio MAX7219 (multiplexa
 * los 8 dígitos a unos 800 Hz) y no depende de la animación.
 */

function matrixOf(ctx: ExportContext): MatrixConfig {
  return ctx.project.device.matrix ?? DEFAULT_MATRIX;
}

/** Bytes de registro de los fotogramas seleccionados. */
export function max7219Frames(ctx: ExportContext, scope: FrameScope) {
  const matrix = matrixOf(ctx);
  const indices = selectedFrames(ctx, scope);
  return {
    matrix,
    indices,
    bytes: indices.map((i) => registerBytes(ctx.project.frames[i]!.pixels, matrix)),
    durations: indices.map((i) => ctx.project.frames[i]!.durationMs),
  };
}

function describeMatrix(m: MatrixConfig): string[] {
  return [
    `Orientación física: módulo girado ${m.rotation}° en sentido horario (el dibujo no se gira).`,
    `Cableado: ${m.wiring} (ver docs/device-profiles.md).`,
    `Brillo: ${m.brightness} de 15 (registro 0x0A).`,
  ];
}

const MAX7219_PINS = ['din', 'clk', 'cs'] as const;
type Max7219Pin = (typeof MAX7219_PINS)[number];

export interface Max7219SketchOptions {
  readonly frames: FrameScope;
  readonly board: string;
  readonly identifier: string;
  readonly pins: Readonly<Record<Max7219Pin, number>>;
}

const DEFAULT_PINS: Readonly<Record<Max7219Pin, number>> = { din: 11, clk: 13, cs: 10 };

function tableBytes(count: number): number {
  return count * MATRIX_SIZE + count * 2;
}

export const max7219ArduinoExporter: Exporter<Max7219SketchOptions> = {
  id: 'arduino-max7219',
  labelKey: 'exporter.arduino-max7219',
  descriptionKey: 'exporter.arduino-max7219.description',
  category: 'code',
  contents: ['frame', 'animation'],
  stability: 'stable',
  extension: '.ino',
  orientation: 'rows',
  bitOrder: 'msb-first',
  constraintKeys: ['constraint.ledMatrixOnly', 'constraint.max7219Registers', 'constraint.avrOnly'],
  supports: (profile) => profile.kind === 'led-matrix',

  defaults(ctx) {
    return {
      frames: 'all',
      board: 'arduino-uno',
      identifier: defaultIdentifier(ctx),
      pins: { ...DEFAULT_PINS },
    };
  },

  normalize(raw, ctx) {
    const d = this.defaults(ctx);
    const r = asRecord(raw);
    const rawPins = asRecord(r['pins']);
    const pins = { ...d.pins };
    for (const p of MAX7219_PINS) pins[p] = pickInt(rawPins[p], 0, 255, d.pins[p]);
    return {
      frames: pickEnum(r['frames'], FRAME_SCOPES, d.frames),
      board: resolveBoard(r['board']).id,
      identifier: pickString(r['identifier'], LIMITS.nameMaxLength * 2, d.identifier),
      pins,
    };
  },

  fields(_ctx, options) {
    const board = resolveBoard(options.board);
    const fields: OptionField[] = [boardField(), identifierField()];
    for (const p of MAX7219_PINS) {
      fields.push({
        kind: 'number',
        key: `pins.${p}`,
        labelKey: `export.option.pin.${p}`,
        min: 0,
        max: board.digitalPinCount - 1,
        step: 1,
        hintKey: 'export.hint.pins',
      });
    }
    return fields;
  },

  estimate(ctx, options) {
    const count = selectedFrames(ctx, options.frames).length;
    const data = tableBytes(count);
    const avr = estimateAvr(resolveBoard(options.board), 'max7219-shiftout', {
      progmemBytes: data,
      ramDataBytes: 0,
      largestObjectBytes: count * MATRIX_SIZE,
    });
    return { dataBytes: data, ...avr, outputBytes: data * 6 + 4096 };
  },

  validate(ctx, options) {
    const board = resolveBoard(options.board);
    const count = selectedFrames(ctx, options.frames).length;
    const out: Diagnostic[] = [
      ...validateIdentifier(options.identifier),
      ...validatePins(
        board,
        MAX7219_PINS.map((p) => ({ name: p, value: options.pins[p] })),
      ),
      ...validateAvr(board, 'max7219-shiftout', {
        progmemBytes: tableBytes(count),
        ramDataBytes: 0,
        largestObjectBytes: count * MATRIX_SIZE,
      }),
      ...validateTextSize(tableBytes(count) * 6 + 4096),
      { severity: 'info', code: 'max7219.verifyOrientation' },
    ];
    return out;
  },

  run(ctx, options) {
    const id = options.identifier;
    const f = max7219Frames(ctx, options.frames);
    const count = f.indices.length;
    const play = playbackParts(count, ctx.project.loopMode);
    const flat = new Uint8Array(count * MATRIX_SIZE);
    f.bytes.forEach((b, i) => flat.set(b, i * MATRIX_SIZE));
    const { din, clk, cs } = options.pins;
    const content = `${sourceHeader(ctx, 'Animación para matriz de LEDs 8x8 con MAX7219', count, [
      'Sin bibliotecas externas: escribe los registros del MAX7219 con shiftOut().',
      `Conexión: DIN=${din}, CLK=${clk}, CS=${cs}; VCC a 5 V y GND común.`,
      ...describeMatrix(f.matrix),
      'Cada fotograma: 8 bytes = registros DIG0..DIG7 (direcciones 0x01..0x08).',
    ])}
${AVR_GUARD}
#include <avr/pgmspace.h>
${play.includes}
static const uint8_t PIN_DIN = ${din};
static const uint8_t PIN_CLK = ${clk};
static const uint8_t PIN_CS = ${cs};
static const uint16_t FRAME_COUNT = ${count};
static const uint8_t BRIGHTNESS = ${f.matrix.brightness};

// ${count} fotograma(s) x 8 registros de dígito (DIG0..DIG7).
static const uint8_t ${id}_digits[${count * MATRIX_SIZE}] PROGMEM = {
${byteLines(flat, '  ', MATRIX_SIZE)}
};

static const uint16_t ${id}_durations_ms[${count}] PROGMEM = {
${numberLines(f.durations, '  ')}
};

${play.helpers}
// Escribe un registro: dirección y valor, MSB primero, con CS a nivel bajo.
static void max7219Write(uint8_t address, uint8_t value) {
  digitalWrite(PIN_CS, LOW);
  shiftOut(PIN_DIN, PIN_CLK, MSBFIRST, address);
  shiftOut(PIN_DIN, PIN_CLK, MSBFIRST, value);
  digitalWrite(PIN_CS, HIGH);
}

static uint16_t frameDurationMs(uint16_t index) {
  return pgm_read_word(&${id}_durations_ms[index]);
}

static void showFrame(uint16_t index) {
  for (uint8_t digit = 0; digit < 8; digit++) {
    max7219Write(digit + 1, pgm_read_byte(&${id}_digits[index * 8u + digit]));
  }
}

void setup() {
  pinMode(PIN_DIN, OUTPUT);
  pinMode(PIN_CLK, OUTPUT);
  pinMode(PIN_CS, OUTPUT);
  digitalWrite(PIN_CS, HIGH);
  max7219Write(${hex8(MAX7219_REG.displayTest)}, 0x00); // prueba de pantalla desactivada
  max7219Write(${hex8(MAX7219_REG.decodeMode)}, 0x00); // sin decodificación BCD (matriz)
  max7219Write(${hex8(MAX7219_REG.scanLimit)}, 0x07); // los 8 dígitos
  max7219Write(${hex8(MAX7219_REG.intensity)}, BRIGHTNESS);
  max7219Write(${hex8(MAX7219_REG.shutdown)}, 0x01); // funcionamiento normal
${play.setupTail}}

${play.loop}`;
    return [textFile(`${sanitizeFileBaseName(id)}.ino`, content, 'text/x-arduino')];
  },
};

export interface Max7219DataOptions {
  readonly frames: FrameScope;
  readonly format: 'bin' | 'c-array';
  readonly identifier: string;
}

export const max7219DataExporter: Exporter<Max7219DataOptions> = {
  id: 'max7219-registers',
  labelKey: 'exporter.max7219-registers',
  descriptionKey: 'exporter.max7219-registers.description',
  category: 'data',
  contents: ['frame', 'animation'],
  stability: 'stable',
  extension: '.bin',
  orientation: 'rows',
  bitOrder: 'msb-first',
  constraintKeys: ['constraint.ledMatrixOnly', 'constraint.max7219Registers'],
  supports: (profile) => profile.kind === 'led-matrix',

  defaults(ctx) {
    return { frames: 'all', format: 'bin', identifier: defaultIdentifier(ctx) };
  },

  normalize(raw, ctx) {
    const d = this.defaults(ctx);
    const r = asRecord(raw);
    return {
      frames: pickEnum(r['frames'], FRAME_SCOPES, d.frames),
      format: pickEnum(r['format'], ['bin', 'c-array'] as const, d.format),
      identifier: pickString(r['identifier'], LIMITS.nameMaxLength * 2, d.identifier),
    };
  },

  fields(_ctx, options) {
    const fields: OptionField[] = [
      {
        kind: 'select',
        key: 'format',
        labelKey: 'export.option.dataFormat',
        choices: [
          { value: 'bin', labelKey: 'export.dataFormat.bin' },
          { value: 'c-array', labelKey: 'export.dataFormat.cArray' },
        ],
      },
    ];
    if (options.format === 'c-array') fields.push(identifierField());
    return fields;
  },

  estimate(ctx, options) {
    const bytes = selectedFrames(ctx, options.frames).length * MATRIX_SIZE;
    return { dataBytes: bytes, outputBytes: options.format === 'bin' ? bytes : bytes * 6 + 1024 };
  },

  validate(ctx, options) {
    return [
      ...(options.format === 'c-array' ? validateIdentifier(options.identifier) : []),
      {
        severity: 'info',
        code: 'max7219.layout',
        params: { frames: selectedFrames(ctx, options.frames).length },
      },
    ];
  },

  run(ctx, options) {
    const f = max7219Frames(ctx, options.frames);
    const flat = new Uint8Array(f.indices.length * MATRIX_SIZE);
    f.bytes.forEach((b, i) => flat.set(b, i * MATRIX_SIZE));
    const base = sanitizeFileBaseName(ctx.project.name);
    if (options.format === 'bin') {
      return [
        {
          name: `${base}_max7219.bin`,
          mime: 'application/octet-stream',
          data: flat,
          text: false,
        },
      ];
    }
    const id = options.identifier;
    const guard = `${id.toUpperCase()}_H`;
    const content = `${sourceHeader(
      ctx,
      'Registros MAX7219 de una matriz de LEDs 8x8',
      f.indices.length,
      [
        'Formato: 8 bytes por fotograma = registros DIG0..DIG7 (direcciones 0x01..0x08).',
        ...describeMatrix(f.matrix),
      ],
    )}
#ifndef ${guard}
#define ${guard}

#include <stdint.h>

#define ${id.toUpperCase()}_FRAME_COUNT ${f.indices.length}u

static const uint8_t ${id}_digits[${flat.length}] = {
${byteLines(flat, '  ', MATRIX_SIZE)}
};

static const uint16_t ${id}_durations_ms[${f.durations.length}] = {
${numberLines(f.durations, '  ')}
};

#endif
`;
    return [textFile(`${sanitizeFileBaseName(id)}.h`, content, 'text/x-c')];
  },
};
