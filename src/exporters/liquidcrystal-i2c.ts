import { LIMITS } from '../core/limits.ts';
import { sanitizeFileBaseName } from '../core/names.ts';
import { playbackParts } from './shared/arduino-playback.ts';
import { AVR_GUARD, boardField, formatI2c, resolveBoard } from './shared/avr.ts';
import { sourceHeader, textFile } from './shared/c-source.ts';
import {
  buildPlan,
  cgramDiagnostics,
  characterProfile,
  charMemory,
  charSketchParts,
} from './shared/char-sketch.ts';
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
  validateIdentifier,
  type FrameScope,
} from './shared/options.ts';
import type { Diagnostic, Exporter } from './types.ts';

/**
 * Boceto Arduino para LCD HD44780 con adaptador I²C PCF8574/PCF8574A y la
 * biblioteca "LiquidCrystal I2C" 1.1.2 (Frank de Brabander).
 *
 * Esa biblioteca usa offsets fijos {0x00, 0x40, 0x14, 0x54} en setCursor(),
 * incorrectos para 16×4; por eso el boceto direcciona la DDRAM con el mapa
 * del perfil mediante lcd.command().
 */

/** Direcciones de 7 bits de PCF8574 (0x20–0x27) y PCF8574A (0x38–0x3F). */
export const PCF8574_ADDRESSES: readonly number[] = [
  0x20, 0x21, 0x22, 0x23, 0x24, 0x25, 0x26, 0x27, 0x38, 0x39, 0x3a, 0x3b, 0x3c, 0x3d, 0x3e, 0x3f,
];

export interface LiquidCrystalI2cOptions {
  readonly frames: FrameScope;
  readonly board: string;
  readonly identifier: string;
  readonly progmem: boolean;
  readonly i2cAddress: number;
}

export const liquidCrystalI2cExporter: Exporter<LiquidCrystalI2cOptions> = {
  id: 'arduino-liquidcrystal-i2c',
  labelKey: 'exporter.arduino-liquidcrystal-i2c',
  descriptionKey: 'exporter.arduino-liquidcrystal-i2c.description',
  category: 'code',
  stability: 'stable',
  extension: '.ino',
  orientation: 'cells',
  bitOrder: 'cgram-rows',
  constraintKeys: ['constraint.characterOnly', 'constraint.cgram8', 'constraint.avrOnly'],
  supports: (profile) => profile.kind === 'character',

  defaults(ctx) {
    return {
      frames: 'all',
      board: 'arduino-uno',
      identifier: defaultIdentifier(ctx),
      progmem: true,
      i2cAddress: 0x27,
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
      i2cAddress: pickInt(Number(r['i2cAddress']), 0, 127, d.i2cAddress),
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
        hintKey: 'export.hint.progmemChar',
      },
      {
        kind: 'select',
        key: 'i2cAddress',
        labelKey: 'export.option.i2cAddress',
        choices: PCF8574_ADDRESSES.map((a) => ({
          value: String(a),
          labelKey: `literal:${formatI2c(a)}`,
        })),
        hintKey: 'export.hint.pcf8574Address',
      },
    ];
  },

  estimate(ctx, options) {
    const plan = buildPlan(ctx, options.frames);
    const mem = charMemory(
      ctx,
      plan,
      resolveBoard(options.board),
      'liquidcrystal-i2c',
      options.progmem,
    );
    return { dataBytes: mem.sizes.total, ...mem.estimate, outputBytes: mem.sizes.total * 6 + 8192 };
  },

  validate(ctx, options) {
    const board = resolveBoard(options.board);
    const plan = buildPlan(ctx, options.frames);
    const out: Diagnostic[] = [
      ...validateIdentifier(options.identifier),
      ...cgramDiagnostics(ctx, plan),
    ];
    if (!PCF8574_ADDRESSES.includes(options.i2cAddress)) {
      out.push({
        severity: 'error',
        code: 'i2c.invalidAddress',
        params: { value: formatI2c(options.i2cAddress) },
      });
    }
    if (plan.overflow.length === 0) {
      out.push(...charMemory(ctx, plan, board, 'liquidcrystal-i2c', options.progmem).diagnostics);
    }
    out.push({
      severity: 'info',
      code: 'i2c.pins',
      params: { sda: board.i2cPins[0], scl: board.i2cPins[1] },
    });
    return out;
  },

  run(ctx, options) {
    const plan = buildPlan(ctx, options.frames);
    if (plan.overflow.length > 0) throw new Error('Desbordamiento CGRAM');
    const profile = characterProfile(ctx);
    const board = resolveBoard(options.board);
    const parts = charSketchParts(ctx, plan, options.progmem);
    const play = playbackParts(plan.frames.length, ctx.project.loopMode);
    const content = `${sourceHeader(
      ctx,
      'Animación para LCD HD44780 con adaptador I2C (PCF8574)',
      plan.frames.length,
      [
        'Biblioteca: "LiquidCrystal I2C" 1.1.2 de Frank de Brabander (gestor de bibliotecas).',
        `Dirección I2C ${formatI2c(options.i2cAddress)}; SDA=${board.i2cPins[0]}, SCL=${board.i2cPins[1]}.`,
        options.progmem ? 'Tablas en flash (PROGMEM).' : 'Tablas en RAM (sin PROGMEM).',
      ],
    )}
${AVR_GUARD}
#include <Wire.h>
#include <LiquidCrystal_I2C.h>
${options.progmem ? '#include <avr/pgmspace.h>\n' : ''}${play.includes}
${parts.constants}
${parts.tables}
LiquidCrystal_I2C lcd(${formatI2c(options.i2cAddress)}, ${profile.columns}, ${profile.rows});

${play.helpers}
${parts.reader}
${parts.showFrame}
void setup() {
  lcd.init();
  lcd.backlight();
  lcd.clear();
${play.setupTail}}

${play.loop}`;
    return [textFile(`${sanitizeFileBaseName(options.identifier)}.ino`, content, 'text/x-arduino')];
  },
};
