import { LIMITS } from '../core/limits.ts';
import { sanitizeFileBaseName } from '../core/names.ts';
import { playbackParts } from './shared/arduino-playback.ts';
import { AVR_GUARD, boardField, resolveBoard, validatePins } from './shared/avr.ts';
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
import type { Diagnostic, Exporter, OptionField } from './types.ts';

/**
 * Boceto Arduino para LCD HD44780 en paralelo de 4 bits con la biblioteca
 * oficial LiquidCrystal (RW a GND).
 */

export const LC_PINS = ['rs', 'enable', 'd4', 'd5', 'd6', 'd7'] as const;
export type LcPin = (typeof LC_PINS)[number];

export interface LiquidCrystalOptions {
  readonly frames: FrameScope;
  readonly board: string;
  readonly identifier: string;
  readonly progmem: boolean;
  readonly pins: Readonly<Record<LcPin, number>>;
}

const DEFAULT_PINS: Readonly<Record<LcPin, number>> = {
  rs: 12,
  enable: 11,
  d4: 5,
  d5: 4,
  d6: 3,
  d7: 2,
};

export const liquidCrystalExporter: Exporter<LiquidCrystalOptions> = {
  id: 'arduino-liquidcrystal',
  labelKey: 'exporter.arduino-liquidcrystal',
  descriptionKey: 'exporter.arduino-liquidcrystal.description',
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
      pins: { ...DEFAULT_PINS },
    };
  },

  normalize(raw, ctx) {
    const d = this.defaults(ctx);
    const r = asRecord(raw);
    const rawPins = asRecord(r['pins']);
    const pins = { ...d.pins };
    for (const p of LC_PINS) pins[p] = pickInt(rawPins[p], 0, 255, d.pins[p]);
    return {
      frames: pickEnum(r['frames'], FRAME_SCOPES, d.frames),
      board: resolveBoard(r['board']).id,
      identifier: pickString(r['identifier'], LIMITS.nameMaxLength * 2, d.identifier),
      progmem: pickBool(r['progmem'], d.progmem),
      pins,
    };
  },

  fields(_ctx, options) {
    const board = resolveBoard(options.board);
    const fields: OptionField[] = [
      frameScopeField(),
      boardField(),
      identifierField(),
      {
        kind: 'boolean',
        key: 'progmem',
        labelKey: 'export.option.progmem',
        hintKey: 'export.hint.progmemChar',
      },
    ];
    for (const p of LC_PINS) {
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
    const plan = buildPlan(ctx, options.frames);
    const mem = charMemory(
      ctx,
      plan,
      resolveBoard(options.board),
      'liquidcrystal',
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
    out.push(
      ...validatePins(
        board,
        LC_PINS.map((p) => ({ name: p, value: options.pins[p] })),
      ),
    );
    if (plan.overflow.length === 0) {
      out.push(...charMemory(ctx, plan, board, 'liquidcrystal', options.progmem).diagnostics);
    }
    return out;
  },

  run(ctx, options) {
    const plan = buildPlan(ctx, options.frames);
    if (plan.overflow.length > 0) throw new Error('Desbordamiento CGRAM');
    const parts = charSketchParts(ctx, plan, options.progmem);
    const play = playbackParts(plan.frames.length, ctx.project.loopMode);
    const { rs, enable, d4, d5, d6, d7 } = options.pins;
    const profile = characterProfile(ctx);
    const content = `${sourceHeader(
      ctx,
      'Animación para LCD HD44780 con LiquidCrystal (4 bits)',
      plan.frames.length,
      [
        'Biblioteca: LiquidCrystal (incluida con Arduino).',
        `Conexión: RS=${rs}, E=${enable}, D4=${d4}, D5=${d5}, D6=${d6}, D7=${d7}; RW a GND.`,
        options.progmem ? 'Tablas en flash (PROGMEM).' : 'Tablas en RAM (sin PROGMEM).',
      ],
    )}
${AVR_GUARD}
#include <LiquidCrystal.h>
${options.progmem ? '#include <avr/pgmspace.h>\n' : ''}${play.includes}
${parts.constants}
${parts.tables}
LiquidCrystal lcd(${rs}, ${enable}, ${d4}, ${d5}, ${d6}, ${d7});

${play.helpers}
${parts.reader}
${parts.showFrame}
void setup() {
  lcd.begin(${profile.columns}, ${profile.rows});
  lcd.clear();
${play.setupTail}}

${play.loop}`;
    return [textFile(`${sanitizeFileBaseName(options.identifier)}.ino`, content, 'text/x-arduino')];
  },
};
