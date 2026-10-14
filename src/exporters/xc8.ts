import { CGRAM_SLOTS } from '../core/charlcd.ts';
import { getPicDevice, PIC_DEVICES, type PicDevice } from '../device-profiles/mcu.ts';
import { hex8, numberLines, sourceHeader, textFile } from './shared/c-source.ts';
import {
  buildPlan,
  cgramDiagnostics,
  characterProfile,
  charTables,
  charTableSizes,
  glyphIndexType,
} from './shared/char-sketch.ts';
import {
  asRecord,
  FRAME_SCOPES,
  frameScopeField,
  pickEnum,
  pickInt,
  pickString,
  type FrameScope,
} from './shared/options.ts';
import type { Diagnostic, Exporter, OptionField } from './types.ts';

/**
 * PIC + XC8 para LCD HD44780 (EXPERIMENTAL).
 *
 * No se ha compilado con el compilador XC8 ni probado en hardware, por eso
 * solo aparece con las funciones experimentales activadas. Genera lcd.h,
 * lcd.c, anim.h, anim.c y main.c para PIC16F877A o PIC18F4550.
 */

export type PinName = 'rs' | 'enable' | 'd4' | 'd5' | 'd6' | 'd7';
const PIN_NAMES: readonly PinName[] = ['rs', 'enable', 'd4', 'd5', 'd6', 'd7'];

export interface Xc8Options {
  readonly frames: FrameScope;
  readonly device: PicDevice['id'];
  readonly oscillatorHz: number;
  readonly bus: '4' | '8';
  readonly pins: Readonly<Record<PinName, string>>;
  readonly dataPort: string;
}

const DEFAULT_PINS: Readonly<Record<PinName, string>> = {
  rs: 'B0',
  enable: 'B1',
  d4: 'B4',
  d5: 'B5',
  d6: 'B6',
  d7: 'B7',
};

/** Frecuencia máxima con cristal HS sin PLL (ambos dispositivos). */
const MAX_HS_HZ = 20_000_000;

interface PinRef {
  readonly port: string;
  readonly bit: number;
}

export function parsePin(text: string): PinRef | undefined {
  const m = /^R?([A-E])([0-7])$/.exec(text.trim().toUpperCase());
  return m ? { port: m[1]!, bit: Number(m[2]) } : undefined;
}

function device(options: Xc8Options): PicDevice {
  return getPicDevice(options.device) ?? PIC_DEVICES[0]!;
}

function pinOut(dev: PicDevice, p: PinRef): string {
  return dev.family === 18
    ? `LAT${p.port}bits.LAT${p.port}${p.bit}`
    : `PORT${p.port}bits.R${p.port}${p.bit}`;
}

function pinTris(p: PinRef): string {
  return `TRIS${p.port}bits.TRIS${p.port}${p.bit}`;
}

function usedPins(options: Xc8Options): PinName[] {
  return options.bus === '4' ? PIN_NAMES.slice() : ['rs', 'enable'];
}

function codeEstimate(dev: PicDevice): number {
  // Driver + animación: estimación conservadora (palabras en PIC16, bytes en PIC18).
  return dev.family === 16 ? 1200 : 2400;
}

export const xc8Exporter: Exporter<Xc8Options> = {
  id: 'pic-xc8',
  labelKey: 'exporter.pic-xc8',
  descriptionKey: 'exporter.pic-xc8.description',
  category: 'code',
  stability: 'experimental',
  extension: '.zip',
  orientation: 'cells',
  bitOrder: 'cgram-rows',
  constraintKeys: ['constraint.characterOnly', 'constraint.cgram8', 'constraint.experimentalXc8'],
  supports: (profile) => profile.kind === 'character',

  defaults() {
    return {
      frames: 'all',
      device: 'pic16f877a',
      oscillatorHz: 4_000_000,
      bus: '4',
      pins: { ...DEFAULT_PINS },
      dataPort: 'D',
    };
  },

  normalize(raw, ctx) {
    const d = this.defaults(ctx);
    const r = asRecord(raw);
    const rawPins = asRecord(r['pins']);
    const pins = { ...d.pins };
    for (const p of PIN_NAMES) pins[p] = pickString(rawPins[p], 4, d.pins[p]);
    return {
      frames: pickEnum(r['frames'], FRAME_SCOPES, d.frames),
      device: pickEnum(
        r['device'],
        PIC_DEVICES.map((x) => x.id),
        d.device,
      ),
      oscillatorHz: pickInt(r['oscillatorHz'], 1, 100_000_000, d.oscillatorHz),
      bus: pickEnum(r['bus'], ['4', '8'] as const, d.bus),
      pins,
      dataPort: pickEnum(r['dataPort'], ['A', 'B', 'C', 'D', 'E'] as const, 'D'),
    };
  },

  fields(_ctx, options) {
    const fields: OptionField[] = [
      frameScopeField(),
      {
        kind: 'select',
        key: 'device',
        labelKey: 'export.option.picDevice',
        choices: PIC_DEVICES.map((d) => ({ value: d.id, labelKey: d.labelKey })),
      },
      {
        kind: 'number',
        key: 'oscillatorHz',
        labelKey: 'export.option.oscillatorHz',
        min: 32_768,
        max: MAX_HS_HZ,
        step: 1,
      },
      {
        kind: 'select',
        key: 'bus',
        labelKey: 'export.option.bus',
        choices: [
          { value: '4', labelKey: 'export.bus.4' },
          { value: '8', labelKey: 'export.bus.8' },
        ],
      },
    ];
    for (const p of usedPins(options)) {
      fields.push({
        kind: 'text',
        key: `pins.${p}`,
        labelKey: `export.option.pin.${p}`,
        maxLength: 4,
        hintKey: 'export.hint.picPin',
      });
    }
    if (options.bus === '8') {
      fields.push({
        kind: 'select',
        key: 'dataPort',
        labelKey: 'export.option.dataPort',
        choices: Object.keys(device(options).ports).map((p) => ({
          value: p,
          labelKey: `literal:PORT${p}`,
        })),
      });
    }
    return fields;
  },

  estimate(ctx, options) {
    const plan = buildPlan(ctx, options.frames);
    const sizes = charTableSizes(characterProfile(ctx), plan);
    const dev = device(options);
    return {
      dataBytes: sizes.total,
      flashBytes: sizes.total + codeEstimate(dev),
      flashBudget: dev.programMemory,
      ramBytes: 64,
      ramBudget: dev.ramBytes,
      outputBytes: sizes.total * 6 + 12_000,
    };
  },

  validate(ctx, options) {
    const dev = device(options);
    const plan = buildPlan(ctx, options.frames);
    const out: Diagnostic[] = [
      { severity: 'warning', code: 'xc8.experimental' },
      ...cgramDiagnostics(ctx, plan),
    ];
    if (options.oscillatorHz < dev.minOscillatorHz || options.oscillatorHz > MAX_HS_HZ) {
      out.push({
        severity: 'error',
        code: 'xc8.frequency',
        params: { value: options.oscillatorHz, min: dev.minOscillatorHz, max: MAX_HS_HZ },
      });
    }
    const seen = new Map<string, string>();
    for (const name of usedPins(options)) {
      const ref = parsePin(options.pins[name]);
      if (!ref) {
        out.push({
          severity: 'error',
          code: 'xc8.pinFormat',
          params: { pin: name, value: options.pins[name] },
        });
        continue;
      }
      if (!dev.ports[ref.port]?.includes(ref.bit)) {
        out.push({
          severity: 'error',
          code: 'xc8.pinMissing',
          params: { pin: name, value: `R${ref.port}${ref.bit}`, device: dev.part },
        });
        continue;
      }
      if (dev.id === 'pic16f877a' && ref.port === 'A' && ref.bit === 4) {
        out.push({ severity: 'error', code: 'xc8.openDrain', params: { pin: name, value: 'RA4' } });
      }
      const key = `${ref.port}${ref.bit}`;
      const other = seen.get(key);
      if (other)
        out.push({
          severity: 'error',
          code: 'pins.duplicate',
          params: { pin: name, other, value: `R${key}` },
        });
      seen.set(key, name);
      if (options.bus === '8' && ref.port === options.dataPort) {
        out.push({
          severity: 'error',
          code: 'xc8.portConflict',
          params: { pin: name, port: options.dataPort },
        });
      }
    }
    if (options.bus === '8') {
      const bits = dev.ports[options.dataPort] ?? [];
      if (bits.length < 8) {
        out.push({
          severity: 'error',
          code: 'xc8.portIncomplete',
          params: { port: options.dataPort, device: dev.part },
        });
      }
    }
    if (plan.overflow.length === 0) {
      const est = this.estimate(ctx, options);
      if ((est.flashBytes ?? 0) > (est.flashBudget ?? 0)) {
        out.push({
          severity: 'error',
          code: 'xc8.programMemory',
          params: {
            used: est.flashBytes ?? 0,
            max: est.flashBudget ?? 0,
            unit: `@unit.${dev.programMemoryUnit}`,
          },
        });
      }
    }
    return out;
  },

  run(ctx, options) {
    const plan = buildPlan(ctx, options.frames);
    if (plan.overflow.length > 0) throw new Error('Desbordamiento CGRAM');
    const profile = characterProfile(ctx);
    const dev = device(options);
    const freq = options.oscillatorHz;
    const pins = Object.fromEntries(
      usedPins(options).map((p) => [p, parsePin(options.pins[p])!]),
    ) as Record<PinName, PinRef>;
    const count = plan.frames.length;
    const idx = glyphIndexType(plan.glyphPool.length);
    const lat = dev.family === 18 ? 'LAT' : 'PORT';
    const twoLines = profile.rows > 1;
    const header = (title: string) =>
      sourceHeader(ctx, title, count, [
        `Dispositivo: ${dev.part}, oscilador ${freq} Hz, bus de ${options.bus} bits.`,
        'EXPERIMENTAL: no verificado con XC8 ni en hardware.',
      ]);

    let pinDefs = `#define LCD_RS        ${pinOut(dev, pins.rs)}\n#define LCD_RS_TRIS   ${pinTris(pins.rs)}\n#define LCD_EN        ${pinOut(dev, pins.enable)}\n#define LCD_EN_TRIS   ${pinTris(pins.enable)}\n`;
    if (options.bus === '4') {
      (['d4', 'd5', 'd6', 'd7'] as const).forEach((p) => {
        pinDefs += `#define LCD_${p.toUpperCase()}        ${pinOut(dev, pins[p])}\n#define LCD_${p.toUpperCase()}_TRIS   ${pinTris(pins[p])}\n`;
      });
    } else {
      pinDefs += `#define LCD_DATA      ${lat}${options.dataPort}\n#define LCD_DATA_TRIS TRIS${options.dataPort}\n`;
    }

    const lcdH = `${header('lcd.h - driver HD44780 para XC8 (RW a GND)')}
#ifndef LCD_H
#define LCD_H

#include <xc.h>
#include <stdint.h>

#ifndef _XTAL_FREQ
#define _XTAL_FREQ ${freq}UL
#endif

${pinDefs}
void lcd_init(void);
void lcd_command(uint8_t command);
void lcd_data(uint8_t value);
void lcd_load_char(uint8_t slot, const uint8_t *rows);
void lcd_delay_ms(uint16_t ms);

#endif
`;

    const writeFn =
      options.bus === '4'
        ? `static void lcd_nibble(uint8_t nibble)
{
    LCD_D4 = (nibble & 0x01u) ? 1 : 0;
    LCD_D5 = (nibble & 0x02u) ? 1 : 0;
    LCD_D6 = (nibble & 0x04u) ? 1 : 0;
    LCD_D7 = (nibble & 0x08u) ? 1 : 0;
    LCD_PULSE();
}

static void lcd_write(uint8_t value, uint8_t rs)
{
    LCD_RS = rs;
    lcd_nibble((uint8_t)(value >> 4));
    lcd_nibble((uint8_t)(value & 0x0Fu));
    __delay_us(50);
}
`
        : `static void lcd_write(uint8_t value, uint8_t rs)
{
    LCD_RS = rs;
    LCD_DATA = value;
    LCD_PULSE();
    __delay_us(50);
}
`;
    const initSeq =
      options.bus === '4'
        ? `    LCD_D4_TRIS = 0;
    LCD_D5_TRIS = 0;
    LCD_D6_TRIS = 0;
    LCD_D7_TRIS = 0;
    LCD_RS = 0;
    LCD_EN = 0;
    __delay_ms(20);
    lcd_nibble(0x03u);
    __delay_ms(5);
    lcd_nibble(0x03u);
    __delay_us(150);
    lcd_nibble(0x03u);
    __delay_us(150);
    lcd_nibble(0x02u);          /* modo de 4 bits */
    __delay_us(150);
    lcd_command(${twoLines ? '0x28u' : '0x20u'});    /* 4 bits, ${twoLines ? '2 líneas' : '1 línea'}, 5x8 */
`
        : `    LCD_DATA_TRIS = 0x00u;
    LCD_RS = 0;
    LCD_EN = 0;
    __delay_ms(20);
    lcd_write(0x30u, 0);
    __delay_ms(5);
    lcd_write(0x30u, 0);
    __delay_us(150);
    lcd_write(0x30u, 0);
    lcd_command(${twoLines ? '0x38u' : '0x30u'});    /* 8 bits, ${twoLines ? '2 líneas' : '1 línea'}, 5x8 */
`;
    const lcdC = `${header('lcd.c - driver HD44780 para XC8')}
#include "lcd.h"

#define LCD_PULSE() do { LCD_EN = 1; __delay_us(1); LCD_EN = 0; } while (0)

${writeFn}
void lcd_command(uint8_t command)
{
    lcd_write(command, 0);
    if (command <= 0x03u) {
        __delay_ms(2);           /* borrar / inicio son lentos */
    }
}

void lcd_data(uint8_t value)
{
    lcd_write(value, 1);
}

void lcd_init(void)
{
    LCD_RS_TRIS = 0;
    LCD_EN_TRIS = 0;
${initSeq}    lcd_command(0x0Cu);          /* pantalla encendida, sin cursor */
    lcd_command(0x06u);          /* autoincremento */
    lcd_command(0x01u);          /* borrar */
}

void lcd_load_char(uint8_t slot, const uint8_t *rows)
{
    uint8_t i;
    lcd_command((uint8_t)(0x40u | (uint8_t)((slot & 7u) << 3)));
    for (i = 0; i < 8u; i++) {
        lcd_data(rows[i]);
    }
}

void lcd_delay_ms(uint16_t ms)
{
    while (ms > 0u) {
        __delay_ms(1);           /* __delay_ms() solo acepta constantes */
        ms--;
    }
}
`;

    const animH = `${header('anim.h - datos y dibujo de la animación')}
#ifndef ANIM_H
#define ANIM_H

#include <stdint.h>

#define ANIM_FRAME_COUNT ${count}u

/* Dibuja el fotograma indicado (carga solo las ranuras CGRAM que cambian). */
void anim_show(uint16_t index);

/* Duración del fotograma en milisegundos. */
uint16_t anim_duration_ms(uint16_t index);

#endif
`;
    const durations = plan.frames.map((f) => ctx.project.frames[f.frameIndex]!.durationMs);
    const animC = `${header('anim.c - tablas de la animación')}
#include "lcd.h"
#include "anim.h"

#define LCD_COLUMNS ${profile.columns}u
#define LCD_ROWS ${profile.rows}u
#define FRAME_COUNT ANIM_FRAME_COUNT
#define GLYPH_COUNT ${Math.max(1, plan.glyphPool.length)}u
typedef ${idx.type} glyph_index_t;
#define NO_GLYPH ((glyph_index_t)${idx.none}u)

/* Dirección DDRAM del inicio de cada fila (${profile.id}). */
static const uint8_t ROW_ADDRESS[LCD_ROWS] = { ${profile.ddramRowAddresses.map(hex8).join(', ')} };

${charTables(profile, plan, '')}
static const uint16_t FRAME_DURATIONS_MS[FRAME_COUNT] = {
${numberLines(durations, '    ')}
};

static glyph_index_t loaded_slots[${CGRAM_SLOTS}] = { NO_GLYPH, NO_GLYPH, NO_GLYPH, NO_GLYPH, NO_GLYPH, NO_GLYPH, NO_GLYPH, NO_GLYPH };

void anim_show(uint16_t index)
{
    uint8_t slot;
    uint8_t row;
    uint8_t col;
    for (slot = 0; slot < ${CGRAM_SLOTS}u; slot++) {
        glyph_index_t glyph = FRAME_SLOTS[index][slot];
        if (glyph != NO_GLYPH && glyph != loaded_slots[slot]) {
            lcd_load_char(slot, GLYPHS[glyph]);
            loaded_slots[slot] = glyph;
        }
    }
    for (row = 0; row < LCD_ROWS; row++) {
        lcd_command((uint8_t)(0x80u | ROW_ADDRESS[row]));
        for (col = 0; col < LCD_COLUMNS; col++) {
            lcd_data(FRAME_CELLS[index][row][col]);
        }
    }
}

uint16_t anim_duration_ms(uint16_t index)
{
    return FRAME_DURATIONS_MS[index];
}
`;

    const config =
      dev.id === 'pic16f877a'
        ? `#pragma config FOSC = ${freq > 4_000_000 ? 'HS' : 'XT'}, WDTE = OFF, PWRTE = ON, BOREN = ON
#pragma config LVP = OFF, CPD = OFF, WRT = OFF, CP = OFF`
        : `#pragma config PLLDIV = 1, CPUDIV = OSC1_PLL2, USBDIV = 1
#pragma config FOSC = ${freq > 4_000_000 ? 'HS' : 'XT_XT'}, FCMEN = OFF, IESO = OFF
#pragma config PWRT = ON, BOR = ON, WDT = OFF, MCLRE = ON, PBADEN = OFF
#pragma config LVP = OFF, XINST = OFF`;
    const digital =
      dev.id === 'pic16f877a'
        ? 'ADCON1 = 0x06;              /* PORTA y PORTE digitales */'
        : 'ADCON1 = 0x0F;              /* todos los pines digitales */';
    const mode = ctx.project.loopMode;
    let advance: string;
    if (mode === 'once') {
      advance = `        if (index + 1u >= ANIM_FRAME_COUNT) {
            hold_last_frame();
        }
        index++;`;
    } else if (mode === 'pingpong') {
      advance = `        if (forward && index + 1u >= ANIM_FRAME_COUNT) {
            forward = 0;
        } else if (!forward && index == 0u) {
            forward = 1;
        }
        if (forward) {
            index++;
        } else {
            index--;
        }`;
    } else {
      advance = `        index++;
        if (index >= ANIM_FRAME_COUNT) {
            index = 0;
        }`;
    }
    const needsHold = count === 1 || mode === 'once';
    const holdFn = needsHold
      ? `/* Mantiene el último fotograma: el LCD conserva su contenido y el PIC duerme
 * (WDT desactivado y sin interrupciones habilitadas: no despierta). */
static void hold_last_frame(void)
{
    while (1) {
        SLEEP();
        NOP();
    }
}

`
      : '';
    const mainC = `${header('main.c - programa principal')}
${config}

#include <xc.h>
#include <stdint.h>
#include "lcd.h"
#include "anim.h"

${holdFn}void main(void)
{
    uint16_t index = 0;
${mode === 'pingpong' ? '    uint8_t forward = 1;\n' : ''}
    ${digital}
    lcd_init();
    anim_show(0);
${
  count === 1
    ? '    hold_last_frame();\n'
    : `    while (1) {
        lcd_delay_ms(anim_duration_ms(index));
${advance}
        anim_show(index);
    }
`
}}
`;
    return [
      textFile('main.c', mainC, 'text/x-c'),
      textFile('lcd.h', lcdH, 'text/x-c'),
      textFile('lcd.c', lcdC, 'text/x-c'),
      textFile('anim.h', animH, 'text/x-c'),
      textFile('anim.c', animC, 'text/x-c'),
    ];
  },
};
