import { GifReader } from 'omggif';
import { describe, expect, it } from 'vitest';
import { DISPLAY_PROFILES, getProfile } from '../../../src/device-profiles/index.ts';
import {
  EXPORTERS,
  exportersFor,
  getExporter,
  inspectExport,
  runExport,
} from '../../../src/exporters/index.ts';
import { packPages, packRowsLsb, packRowsMsb } from '../../../src/exporters/shared/packing.ts';
import { parsePin } from '../../../src/exporters/xc8.ts';
import type { ExportContext, ExportOutcome } from '../../../src/exporters/types.ts';
import { goldenPatterns } from '../../helpers/bitmap.ts';
import { BAR, charPixels, ctxFor, HEART, makeProject, SMILE } from '../../helpers/projects.ts';

function run(id: string, ctx: ExportContext, options: Record<string, unknown> = {}): ExportOutcome {
  const exporter = getExporter(id);
  if (!exporter) throw new Error(`Sin exportador ${id}`);
  return runExport(exporter, ctx, options);
}

function text(outcome: ExportOutcome, index = 0): string {
  expect(outcome.files, JSON.stringify(outcome.diagnostics)).toBeDefined();
  return new TextDecoder().decode(outcome.files![index]!.data);
}

function codes(outcome: ExportOutcome, severity = 'error'): string[] {
  return outcome.diagnostics.filter((d) => d.severity === severity).map((d) => d.code);
}

/** Código sin comentarios, para comprobar qué funciones se usan realmente. */
function code(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/** Bytes hexadecimales de un arreglo C con nombre. */
function arrayBytes(source: string, name: string): number[] {
  const m = new RegExp(`${name}\\[[^\\]]*\\][^=]*=\\s*\\{([^}]*)\\}`).exec(source);
  if (!m) throw new Error(`Sin arreglo ${name}`);
  return [...m[1]!.matchAll(/0x([0-9A-F]{2})/g)].map((x) => Number.parseInt(x[1]!, 16));
}

const W = 13;
const H = 11;
const gold = goldenPatterns(W, H);
const goldenFrames = Object.values(gold).map((pixels, i) => ({ pixels, durationMs: 100 + i * 10 }));
const customProject = () =>
  makeProject('graphic-custom', goldenFrames, { width: W, height: H, name: 'Dorado' });

const charProject = (
  loopMode: 'loop' | 'once' | 'pingpong' = 'loop',
  profileId = 'hd44780-16x2',
) => {
  const p = getProfile(profileId)!;
  const cols = p.kind === 'character' ? p.columns : 16;
  const rows = p.kind === 'character' ? p.rows : 2;
  return makeProject(
    profileId,
    [
      {
        pixels: charPixels(cols, rows, {
          '0,0': HEART,
          '0,1': SMILE,
          [`${rows - 1},${cols - 1}`]: HEART,
        }),
        durationMs: 250,
      },
      { pixels: charPixels(cols, rows, { '0,0': SMILE, '1,2': BAR }), durationMs: 125 },
    ],
    { loopMode, name: 'Caras' },
  );
};

describe('registro', () => {
  it('cada exportador declara sus metadatos', () => {
    const ids = EXPORTERS.map((e) => e.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const e of EXPORTERS) {
      expect(e.labelKey).toMatch(/^exporter\./);
      expect(e.extension).toMatch(/^\.[a-z]+$/);
      expect(['stable', 'experimental']).toContain(e.stability);
      expect(DISPLAY_PROFILES.some((p) => e.supports(p))).toBe(true);
    }
  });

  it('filtra por perfil y oculta los experimentales', () => {
    const lcd = getProfile('hd44780-16x2')!;
    const oled = getProfile('ssd1306-128x64')!;
    const stableLcd = exportersFor(lcd, false).map((e) => e.id);
    expect(stableLcd).toContain('arduino-liquidcrystal');
    expect(stableLcd).not.toContain('pic-xc8');
    expect(stableLcd).not.toContain('adafruit-gfx');
    expect(exportersFor(lcd, true).map((e) => e.id)).toContain('pic-xc8');
    expect(exportersFor(oled, true).map((e) => e.id)).not.toContain('arduino-liquidcrystal');
  });

  it('rechaza perfiles incompatibles', () => {
    const out = runExport(getExporter('adafruit-gfx')!, ctxFor(charProject()), {});
    expect(codes(out)).toEqual(['export.unsupportedProfile']);
    expect(out.files).toBeUndefined();
  });

  it('todos los exportadores son deterministas y no emiten NaN ni undefined', () => {
    const projects = [
      charProject('pingpong'),
      customProject(),
      makeProject('ssd1306-128x64', [{ pixels: goldenPatterns(128, 64).diagonal }]),
    ];
    for (const project of projects) {
      const ctx = ctxFor(project);
      for (const e of exportersFor(ctx.profile, true)) {
        const a = runExport(e, ctx, {});
        const b = runExport(e, ctx, {});
        expect(a.files, `${e.id}: ${JSON.stringify(a.diagnostics)}`).toBeDefined();
        expect(b.files!.map((f) => f.data)).toEqual(a.files!.map((f) => f.data));
        for (const f of a.files!) {
          if (!f.text) continue;
          const t = new TextDecoder().decode(f.data);
          expect(t, `${e.id}/${f.name}`).not.toMatch(/NaN|undefined|Infinity|\[object/);
          expect(t.endsWith('\n')).toBe(true);
          expect(t.includes('\r')).toBe(false);
        }
      }
    }
  });

  it('inspectExport devuelve opciones normalizadas sin generar archivos', () => {
    const ctx = ctxFor(customProject());
    const r = inspectExport(getExporter('binary')!, ctx, { packing: 'zz', frames: 7 });
    expect(r.options).toEqual({ frames: 'all', packing: 'rows-msb' });
    expect(r.estimate.dataBytes).toBe(6 * 2 * 11);
  });
});

describe('Adafruit_GFX (filas MSB)', () => {
  it('genera tablas iguales al empaquetado MSB para todos los patrones dorados', () => {
    const ctx = ctxFor(customProject());
    const src = text(run('adafruit-gfx', ctx));
    Object.values(gold).forEach((px, i) => {
      expect(arrayBytes(src, `Dorado_frame_${i}`)).toEqual(Array.from(packRowsMsb(px, W, H)));
    });
    expect(src).toContain('PROGMEM');
    expect(src).toContain('static const uint16_t Dorado_durations_ms[6] PROGMEM');
    expect(src).toContain('#define DORADO_FRAME_COUNT 6u');
  });

  it('fuerza PROGMEM y genera un boceto SSD1306 completo', () => {
    const ctx = ctxFor(
      makeProject('ssd1306-128x32', [{ pixels: goldenPatterns(128, 32).border }], {
        loopMode: 'once',
      }),
    );
    const out = run('adafruit-gfx', ctx, { progmem: false, i2cAddress: 0x3d });
    const src = text(out);
    expect(out.files![0]!.name).toBe('Prueba.ino');
    expect(src).toContain('display.begin(SSD1306_SWITCHCAPVCC, 0x3D)');
    expect(src).toContain('pgm_read_ptr(&Prueba_frames[index])');
    expect(src).toContain('holdLastFrame();');
    expect(src).toContain('#include <avr/sleep.h>');
    expect(src).not.toMatch(/void loop\(\) \{\s*\}/);
    const fields = getExporter('adafruit-gfx')!.fields(
      ctx,
      getExporter('adafruit-gfx')!.normalize({}, ctx),
    );
    expect(fields.find((f) => f.key === 'progmem')).toMatchObject({
      kind: 'boolean',
      locked: true,
    });
  });

  it('no ofrece boceto para pantallas sin controlador conocido', () => {
    const ctx = ctxFor(customProject());
    const e = getExporter('adafruit-gfx')!;
    expect(e.normalize({ sketch: true }, ctx)).toMatchObject({ sketch: false });
    expect(e.fields(ctx, e.normalize({}, ctx)).some((f) => f.key === 'sketch')).toBe(false);
  });

  it('bloquea fotogramas que superan el objeto máximo de AVR y la memoria', () => {
    const big = makeProject('graphic-custom', [{ pixels: new Uint8Array(512 * 512) }], {
      width: 512,
      height: 512,
    });
    expect(codes(run('adafruit-gfx', ctxFor(big)))).toEqual(
      expect.arrayContaining(['avr.objectTooLarge', 'avr.flash']),
    );
    const many = makeProject(
      'ssd1306-128x64',
      Array.from({ length: 40 }, () => ({ pixels: new Uint8Array(128 * 64) })),
    );
    expect(codes(run('adafruit-gfx', ctxFor(many)))).toContain('avr.flash');
    const mega = run('adafruit-gfx', ctxFor(many), { board: 'arduino-mega2560' });
    expect(codes(mega)).toEqual([]);
    const huge = makeProject(
      'ssd1306-128x64',
      Array.from({ length: 70 }, () => ({ pixels: new Uint8Array(128 * 64) })),
    );
    expect(codes(run('adafruit-gfx', ctxFor(huge), { board: 'arduino-mega2560' }))).toContain(
      'avr.progmemFar',
    );
  });

  it('valida el identificador', () => {
    expect(codes(run('adafruit-gfx', ctxFor(customProject()), { identifier: '9 malo' }))).toContain(
      'export.invalidIdentifier',
    );
  });

  it('exporta solo el fotograma actual si se pide', () => {
    const src = text(run('adafruit-gfx', ctxFor(customProject(), 2), { frames: 'current' }));
    expect(arrayBytes(src, 'Dorado_frame_0')).toEqual(Array.from(packRowsMsb(gold.isolated, W, H)));
    expect(src).toContain('FRAME_COUNT 1u');
  });
});

describe('U8g2 / XBM (filas LSB)', () => {
  it('con PROGMEM usa U8X8_PROGMEM y drawXBMP', () => {
    const ctx = ctxFor(
      makeProject(
        'ssd1306-128x64',
        [{ pixels: goldenPatterns(128, 64).checker }, { pixels: goldenPatterns(128, 64).border }],
        { loopMode: 'pingpong' },
      ),
    );
    const src = text(run('u8g2-xbm', ctx));
    expect(src).toContain('U8G2_SSD1306_128X64_NONAME_1_HW_I2C u8g2');
    expect(src).toContain('U8X8_PROGMEM');
    expect(src).toContain('drawXBMP');
    expect(src).toContain('static bool forward = true;');
    expect(arrayBytes(src, 'Prueba_frame_0')).toEqual(
      Array.from(packRowsLsb(goldenPatterns(128, 64).checker, 128, 64)),
    );
  });

  it('sin PROGMEM no usa pgm_read_* y comprueba la RAM', () => {
    const ctx = ctxFor(makeProject('ssd1306-128x32', [{ pixels: new Uint8Array(128 * 32) }]));
    const src = text(run('u8g2-xbm', ctx, { progmem: false }));
    expect(code(src)).not.toMatch(/pgm_read|PROGMEM|memcpy_P/);
    expect(src).toContain('drawXBM(0, 0');
    const two = makeProject('ssd1306-128x64', [
      { pixels: new Uint8Array(8192) },
      { pixels: new Uint8Array(8192) },
    ]);
    expect(codes(run('u8g2-xbm', ctxFor(two), { progmem: false }))).toContain('avr.ram');
  });

  it('archivo .h para pantallas sin boceto', () => {
    const out = run('u8g2-xbm', ctxFor(customProject()), { progmem: false });
    expect(out.files![0]!.name).toBe('Dorado.h');
    expect(text(out)).toContain('drawXBM(');
  });
});

describe('páginas verticales', () => {
  it('coincide con el empaquetado por páginas y documenta el relleno', () => {
    const src = text(run('vertical-pages', ctxFor(customProject())));
    expect(arrayBytes(src, 'Dorado_frame_5')).toEqual(Array.from(packPages(gold.border, W, H)));
    expect(src).toContain('no es múltiplo de 8');
    const ks = text(
      run(
        'vertical-pages',
        ctxFor(makeProject('ks0108-128x64', [{ pixels: new Uint8Array(8192) }])),
      ),
    );
    expect(ks).toContain('KS0108');
    expect(ks).toContain('múltiplo de 8: no hay bits de relleno');
  });

  it('sin PROGMEM no incluye pgmspace', () => {
    const src = text(run('vertical-pages', ctxFor(customProject()), { progmem: false }));
    expect(code(src)).not.toMatch(/PROGMEM|pgm_read|pgmspace/);
  });
});

describe('Arduino LiquidCrystal', () => {
  it('usa el mapa DDRAM del perfil (16×4: 0x10 y 0x50)', () => {
    const src = text(run('arduino-liquidcrystal', ctxFor(charProject('loop', 'hd44780-16x4'))));
    expect(src).toContain('ROW_ADDRESS[LCD_ROWS] = { 0x00, 0x40, 0x10, 0x50 }');
    expect(src).toContain('lcd.command(0x80 | ROW_ADDRESS[row]);');
    expect(code(src)).not.toContain('setCursor');
    expect(src).toContain('lcd.begin(16, 4);');
    const twenty = text(run('arduino-liquidcrystal', ctxFor(charProject('loop', 'hd44780-20x4'))));
    expect(twenty).toContain('{ 0x00, 0x40, 0x14, 0x54 }');
  });

  it('modo "una vez" detiene el MCU y bucle no lo incluye', () => {
    const once = text(run('arduino-liquidcrystal', ctxFor(charProject('once'))));
    expect(once).toContain('holdLastFrame();');
    expect(once).toContain('sleep_cpu();');
    const loop = text(run('arduino-liquidcrystal', ctxFor(charProject('loop'))));
    expect(loop).not.toContain('sleep');
    expect(loop).toContain('frameIndex = 0;');
  });

  it('PROGMEM desactivado: sin pgm_read_* ni memcpy_P', () => {
    const src = text(run('arduino-liquidcrystal', ctxFor(charProject()), { progmem: false }));
    expect(code(src)).not.toMatch(/pgm_read|memcpy_P|PROGMEM/);
    expect(src).toContain('memcpy(rows, GLYPHS[glyph], 8);');
    const pm = text(run('arduino-liquidcrystal', ctxFor(charProject())));
    expect(pm).toContain('memcpy_P(rows, GLYPHS[glyph], 8);');
    expect(pm).toContain('pgm_read_byte(&FRAME_SLOTS[index][slot])');
  });

  it('genera las tablas de celdas con ranuras CGRAM y espacios', () => {
    const src = text(run('arduino-liquidcrystal', ctxFor(charProject())));
    expect(src).toContain('{ 0x00, 0x01, 0x20,');
    expect(src).toContain('static const uint16_t FRAME_COUNT = 2;');
    expect(src).toContain('typedef uint8_t glyph_index_t;');
    expect(src).toContain('0b01010');
  });

  it('bloquea la exportación si un fotograma necesita más de 8 caracteres y lista las celdas', () => {
    const cells: Record<string, number[]> = {};
    for (let c = 0; c < 10; c++) cells[`0,${c}`] = [c + 1, 0, 0, 0, 0, 0, 0, 1];
    const p = makeProject('hd44780-16x2', [{ pixels: charPixels(16, 2, cells) }]);
    const out = run('arduino-liquidcrystal', ctxFor(p));
    expect(out.files).toBeUndefined();
    const d = out.diagnostics.find((x) => x.code === 'cgram.overflow')!;
    expect(d.cells).toEqual([
      { frame: 0, row: 0, col: 8 },
      { frame: 0, row: 0, col: 9 },
    ]);
  });

  it('usa uint16_t cuando hay más de 255 glifos', () => {
    const frames = Array.from({ length: 33 }, (_, f) => {
      const cells: Record<string, number[]> = {};
      for (let c = 0; c < 8; c++)
        cells[`0,${c}`] = [(f * 8 + c) & 31, ((f * 8 + c) >> 5) & 31, 1, 0, 0, 0, 0, 0];
      return { pixels: charPixels(16, 2, cells) };
    });
    const src = text(
      run('arduino-liquidcrystal', ctxFor(makeProject('hd44780-16x2', frames)), {
        board: 'arduino-mega2560',
      }),
    );
    expect(src).toContain('typedef uint16_t glyph_index_t;');
    expect(src).toContain('NO_GLYPH = 0xFFFF');
    expect(src).toContain('pgm_read_word(&FRAME_SLOTS[index][slot])');
  });

  it('valida pines duplicados, fuera de rango y del puerto serie', () => {
    const ctx = ctxFor(charProject());
    const dup = run('arduino-liquidcrystal', ctx, {
      pins: { rs: 12, enable: 12, d4: 5, d5: 4, d6: 3, d7: 2 },
    });
    expect(codes(dup)).toContain('pins.duplicate');
    const range = run('arduino-liquidcrystal', ctx, {
      pins: { rs: 40, enable: 11, d4: 5, d5: 4, d6: 3, d7: 2 },
    });
    expect(codes(range)).toContain('pins.outOfRange');
    expect(
      codes(
        run('arduino-liquidcrystal', ctx, {
          board: 'arduino-mega2560',
          pins: { rs: 40, enable: 11, d4: 5, d5: 4, d6: 3, d7: 2 },
        }),
      ),
    ).toEqual([]);
    const serial = run('arduino-liquidcrystal', ctx, {
      pins: { rs: 0, enable: 11, d4: 5, d5: 4, d6: 3, d7: 2 },
    });
    expect(codes(serial, 'warning')).toContain('pins.serial');
  });

  it('avisa si la ROM elegida es experimental', () => {
    const p = { ...charProject(), romCharset: 'hd44780-a00' as const };
    expect(codes(run('arduino-liquidcrystal', ctxFor(p)), 'warning')).toContain('rom.experimental');
  });

  it('un único fotograma se muestra y el MCU se detiene', () => {
    const p = makeProject('hd44780-20x2', [{ pixels: charPixels(20, 2, { '1,19': BAR }) }]);
    const src = text(run('arduino-liquidcrystal', ctxFor(p)));
    expect(src).toContain('showFrame(0);\n  holdLastFrame();');
  });
});

describe('Arduino LiquidCrystal_I2C', () => {
  it('valida la dirección I²C y direcciona la DDRAM sin setCursor', () => {
    const ctx = ctxFor(charProject('loop', 'hd44780-16x4'));
    expect(codes(run('arduino-liquidcrystal-i2c', ctx, { i2cAddress: 0x50 }))).toContain(
      'i2c.invalidAddress',
    );
    const out = run('arduino-liquidcrystal-i2c', ctx, { i2cAddress: 0x3f });
    const src = text(out);
    expect(src).toContain('LiquidCrystal_I2C lcd(0x3F, 16, 4);');
    expect(src).toContain('{ 0x00, 0x40, 0x10, 0x50 }');
    expect(code(src)).not.toContain('setCursor');
    expect(codes(out, 'info')).toContain('i2c.pins');
  });
});

describe('caracteres personalizados', () => {
  it('exporta el fotograma actual por omisión', () => {
    const src = text(run('custom-chars', ctxFor(charProject(), 1)));
    expect(src).toContain('Caras_char_0[8]');
    expect(src).toContain('Caras_char_1[8]');
    expect(src).not.toContain('Caras_char_2[8]');
    expect(src).toContain('Fotograma 2:');
    expect(src).toContain('#define CARAS_CHAR_COUNT 2u');
  });

  it('informa si no hay caracteres propios', () => {
    const p = makeProject('hd44780-16x2', [{ pixels: new Uint8Array(80 * 16) }]);
    const out = run('custom-chars', ctxFor(p));
    expect(codes(out, 'info')).toContain('cgram.noCustomChars');
    expect(text(out)).toContain('no necesitan caracteres propios');
  });
});

describe('PIC XC8 (experimental)', () => {
  it('genera los cinco archivos con el mapa DDRAM y aviso experimental', () => {
    const out = run('pic-xc8', ctxFor(charProject('once', 'hd44780-20x4')));
    expect(out.files!.map((f) => f.name)).toEqual(['main.c', 'lcd.h', 'lcd.c', 'anim.h', 'anim.c']);
    expect(codes(out, 'warning')).toContain('xc8.experimental');
    const anim = text(out, 4);
    expect(anim).toContain('{ 0x00, 0x40, 0x14, 0x54 }');
    const main = text(out, 0);
    expect(main).toContain('SLEEP();');
    expect(main).toContain('hold_last_frame();');
    expect(main).toContain('#pragma config FOSC = XT');
    const loop = text(run('pic-xc8', ctxFor(charProject('loop'))), 0);
    expect(loop).not.toContain('hold_last_frame');
  });

  it('PIC18 usa LAT y el bus de 8 bits un puerto completo', () => {
    const out = run('pic-xc8', ctxFor(charProject('pingpong')), {
      device: 'pic18f4550',
      bus: '8',
      dataPort: 'D',
      oscillatorHz: 20_000_000,
      pins: { rs: 'B0', enable: 'RB1' },
    });
    const h = text(out, 1);
    expect(h).toContain('LATBbits.LATB0');
    expect(h).toContain('#define LCD_DATA      LATD');
    expect(text(out, 0)).toContain('FOSC = HS');
    expect(text(out, 0)).toContain('uint8_t forward = 1;');
  });

  it('valida pines, puertos y frecuencia', () => {
    const ctx = ctxFor(charProject());
    const bad = run('pic-xc8', ctx, {
      oscillatorHz: 40_000_000,
      pins: { rs: 'A4', enable: 'X9', d4: 'B4', d5: 'B4', d6: 'E7', d7: 'B7' },
    });
    expect(codes(bad)).toEqual(
      expect.arrayContaining([
        'xc8.frequency',
        'xc8.openDrain',
        'xc8.pinFormat',
        'pins.duplicate',
        'xc8.pinMissing',
      ]),
    );
    const conflict = run('pic-xc8', ctx, {
      bus: '8',
      dataPort: 'B',
      pins: { rs: 'B0', enable: 'C1' },
    });
    expect(codes(conflict)).toContain('xc8.portConflict');
    const incomplete = run('pic-xc8', ctx, {
      bus: '8',
      dataPort: 'E',
      pins: { rs: 'B0', enable: 'B1' },
    });
    expect(codes(incomplete)).toContain('xc8.portIncomplete');
    expect(parsePin('rb7')).toEqual({ port: 'B', bit: 7 });
    expect(parsePin('B8')).toBeUndefined();
  });
});

describe('datos binarios y ASCII', () => {
  it('concatena los fotogramas con el empaquetado elegido', () => {
    const ctx = ctxFor(customProject());
    for (const [packing, fn] of [
      ['rows-msb', packRowsMsb],
      ['rows-lsb', packRowsLsb],
      ['pages', packPages],
    ] as const) {
      const out = run('binary', ctx, { packing });
      const expected = Object.values(gold).flatMap((px) => Array.from(fn(px, W, H)));
      expect(Array.from(out.files![0]!.data)).toEqual(expected);
      expect(out.files![0]!.name).toBe(`Dorado_${packing}.bin`);
    }
  });

  it('ASCII art con # y .', () => {
    const p = makeProject(
      'graphic-custom',
      [
        { pixels: Uint8Array.from([1, 0, 0, 1]) },
        { pixels: Uint8Array.from([0, 0, 0, 0]), durationMs: 40 },
      ],
      { width: 2, height: 2 },
    );
    expect(text(run('ascii', ctxFor(p)))).toBe('#.\n.#\n');
    expect(text(run('ascii', ctxFor(p), { frames: 'all' }))).toBe(
      '; fotograma 1 (200 ms)\n#.\n.#\n\n; fotograma 2 (40 ms)\n..\n..\n',
    );
  });

  it('rechaza salidas de texto demasiado grandes', () => {
    const p = makeProject(
      'graphic-custom',
      Array.from({ length: 240 }, () => ({ pixels: new Uint8Array(512 * 512) })),
      { width: 512, height: 512 },
    );
    expect(codes(run('ascii', ctxFor(p), { frames: 'all' }))).toContain('export.outputTooLarge');
    expect(codes(run('vertical-pages', ctxFor(p), { board: 'arduino-mega2560' }))).toContain(
      'export.outputTooLarge',
    );
  });
});

describe('imágenes', () => {
  it('PNG del fotograma actual con escala y separación de celdas', () => {
    const ctx = ctxFor(charProject(), 1);
    const out = run('png', ctx, { scale: 2 });
    const png = out.files![0]!;
    expect(png.name).toBe('Caras_2.png');
    const view = new DataView(png.data.buffer, png.data.byteOffset);
    // 16 columnas × 5 px × 2 + 15 separaciones × 2 = 190; 2 filas × 8 × 2 + 2 = 34.
    expect([view.getUint32(16), view.getUint32(20)]).toEqual([190, 34]);
    const plain = run('png', ctx, { scale: 1, cellGap: false, colors: 'mono' }).files![0]!;
    const v2 = new DataView(plain.data.buffer, plain.data.byteOffset);
    expect([v2.getUint32(16), v2.getUint32(20)]).toEqual([80, 16]);
  });

  it('rechaza imágenes exportadas demasiado grandes', () => {
    const p = makeProject('graphic-custom', [{ pixels: new Uint8Array(512 * 512) }], {
      width: 512,
      height: 512,
    });
    expect(codes(run('png', ctxFor(p), { scale: 16 }))).toContain('image.exportTooLarge');
    expect(codes(run('png', ctxFor(p), { scale: 8 }))).toEqual([]);
  });

  it('hoja de sprites con metadatos', () => {
    const out = run('sprite-sheet', ctxFor(customProject()), { scale: 1, layout: 'grid' });
    expect(out.files!.map((f) => f.name)).toEqual(['Dorado_sprites.png', 'Dorado_sprites.json']);
    const meta = JSON.parse(text(out, 1)) as {
      width: number;
      height: number;
      frames: { x: number; y: number }[];
    };
    expect([meta.width, meta.height]).toEqual([W * 3, H * 2]);
    expect(meta.frames[4]).toMatchObject({ x: W, y: H, durationMs: 140 });
    const horizontal = run('sprite-sheet', ctxFor(customProject()), {
      scale: 1,
      layout: 'horizontal',
      metadata: false,
    });
    expect(horizontal.files).toHaveLength(1);
    const big = makeProject(
      'graphic-custom',
      Array.from({ length: 240 }, () => ({ pixels: new Uint8Array(512 * 512) })),
      { width: 512, height: 512 },
    );
    expect(codes(run('sprite-sheet', ctxFor(big), { scale: 4 }))).toContain('image.exportTooLarge');
  });

  it('GIF respeta bucle, ida y vuelta y "una vez"', () => {
    const frames = [
      { pixels: gold.checker, durationMs: 100 },
      { pixels: gold.border, durationMs: 200 },
      { pixels: gold.full, durationMs: 305 },
    ];
    const decode = (mode: 'loop' | 'once' | 'pingpong') => {
      const p = makeProject('graphic-custom', frames, { width: W, height: H, loopMode: mode });
      const out = run('gif', ctxFor(p), { scale: 1 });
      return { out, reader: new GifReader(out.files![0]!.data) };
    };
    const loop = decode('loop');
    expect(loop.reader.numFrames()).toBe(3);
    expect(loop.reader.loopCount()).toBe(0);
    expect(loop.reader.frameInfo(2).delay).toBe(31);
    expect(codes(loop.out, 'warning')).toContain('gif.durationRounded');
    const ping = decode('pingpong');
    expect(ping.reader.numFrames()).toBe(4);
    expect(ping.reader.frameInfo(3).delay).toBe(20);
    const once = decode('once');
    expect(once.reader.loopCount()).toBeNull();
  });

  it('GIF demasiado grande se rechaza', () => {
    const p = makeProject(
      'graphic-custom',
      Array.from({ length: 240 }, () => ({ pixels: new Uint8Array(512 * 512) })),
      { width: 512, height: 512 },
    );
    expect(codes(run('gif', ctxFor(p), { scale: 3 }))).toContain('gif.tooLarge');
  });
});
