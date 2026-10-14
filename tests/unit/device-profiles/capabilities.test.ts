import { describe, expect, it } from 'vitest';
import { adaptDevice, deviceErrors, isValidMatrix } from '../../../src/core/device.ts';
import { createProject, setDevice } from '../../../src/core/project.ts';
import {
  connectionsFor,
  DISPLAY_PROFILES,
  getProfile,
  isConnectionFor,
  targetsFor,
} from '../../../src/device-profiles/index.ts';
import {
  formatChoices,
  optionsForContent,
  projectForContent,
} from '../../../src/exporters/content.ts';
import { getExporter } from '../../../src/exporters/index.ts';
import { ctxFor, makeProject } from '../../helpers/projects.ts';

const profile = (id: string) => getProfile(id)!;
const ids = (list: readonly { exporterId: string }[]) => list.map((t) => t.exporterId);

describe('conexiones y destinos de código', () => {
  it('HD44780: 4 bits, 8 bits e I²C con sus destinos', () => {
    const p = profile('hd44780-16x2');
    expect(connectionsFor(p).map((c) => c.id)).toEqual([
      'hd44780-4bit',
      'hd44780-8bit',
      'hd44780-i2c-pcf8574',
    ]);
    expect(ids(targetsFor(p, 'hd44780-4bit'))).toEqual(['arduino-liquidcrystal', 'pic-xc8']);
    expect(ids(targetsFor(p, 'hd44780-8bit'))).toEqual(['pic-xc8']);
    expect(ids(targetsFor(p, 'hd44780-i2c-pcf8574'))).toEqual(['arduino-liquidcrystal-i2c']);
    expect(ids(targetsFor(p, null))).toEqual([
      'arduino-liquidcrystal',
      'pic-xc8',
      'arduino-liquidcrystal-i2c',
    ]);
    expect(targetsFor(p, 'spi')).toEqual([]);
    expect(isConnectionFor(p, 'i2c')).toBe(false);
  });

  it('el bus de 4/8 bits solo existe en el HD44780', () => {
    for (const p of DISPLAY_PROFILES.filter((x) => x.kind !== 'character')) {
      expect(connectionsFor(p).some((c) => c.id.includes('bit'))).toBe(false);
    }
  });

  it('gráficas por controlador, genérica sin conexión y matriz LED', () => {
    expect(connectionsFor(profile('ssd1306-128x64')).map((c) => c.id)).toEqual(['i2c', 'spi']);
    expect(connectionsFor(profile('pcd8544-84x48')).map((c) => c.id)).toEqual(['spi']);
    expect(connectionsFor(profile('ks0108-128x64')).map((c) => c.id)).toEqual(['parallel']);
    expect(connectionsFor(profile('graphic-custom'))).toEqual([]);
    expect(ids(targetsFor(profile('graphic-custom'), null))).toEqual([
      'adafruit-gfx',
      'u8g2-xbm',
      'vertical-pages',
    ]);
    expect(ids(targetsFor(profile('max7219-8x8'), 'max7219-spi'))).toEqual(['arduino-max7219']);
    // Todos los destinos declarados existen en el registro de exportadores.
    for (const p of DISPLAY_PROFILES)
      for (const t of targetsFor(p, null))
        expect(getExporter(t.exporterId)?.supports(p)).toBe(true);
  });

  it('valida y adapta la configuración del dispositivo', () => {
    const lcd = profile('hd44780-20x4');
    expect(deviceErrors(lcd, { connection: 'spi', codeTarget: null, matrix: null })).toEqual([
      'device.invalidConnection',
    ]);
    expect(
      deviceErrors(lcd, { connection: null, codeTarget: 'adafruit-gfx', matrix: null }),
    ).toEqual(['device.invalidTarget']);
    const led = profile('max7219-8x8');
    expect(deviceErrors(led, { connection: null, codeTarget: null, matrix: null })).toEqual([
      'device.invalidMatrix',
    ]);
    expect(isValidMatrix({ rotation: 45, wiring: 'rows-msb-left', brightness: 1 })).toBe(false);
    expect(isValidMatrix({ rotation: 0, wiring: 'x', brightness: 1 })).toBe(false);
    expect(isValidMatrix({ rotation: 0, wiring: 'rows-msb-left', brightness: 16 })).toBe(false);
    expect(isValidMatrix(null)).toBe(false);
    expect(
      adaptDevice(led, {
        connection: 'max7219-spi',
        codeTarget: 'arduino-max7219',
        matrix: { rotation: 90, wiring: 'cols-lsb-top', brightness: 2 },
      }).matrix,
    ).toEqual({ rotation: 90, wiring: 'cols-lsb-top', brightness: 2 });
    expect(() =>
      setDevice(createProject({ name: 'x', profileId: 'hd44780-16x2' }), {
        connection: 'i2c',
        codeTarget: null,
        matrix: null,
      }),
    ).toThrow(/device.invalid/);
    expect(() =>
      createProject({
        name: 'x',
        profileId: 'hd44780-16x2',
        device: { connection: 'spi', codeTarget: null, matrix: null },
      }),
    ).toThrow(/device.invalid/);
  });
});

describe('contenido exportable', () => {
  it('la selección se exporta como imagen del rectángulo recortado', () => {
    const px = new Uint8Array(80 * 16);
    px[2 * 80 + 3] = 1;
    const p = makeProject('hd44780-16x2', [{ pixels: px }]);
    const r = projectForContent(p, 'selection', 0, { x: 2, y: 1, width: 4, height: 3 })!;
    expect(r.project.profileId).toBe('graphic-custom');
    expect([r.project.width, r.project.height]).toEqual([4, 3]);
    expect(Array.from(r.project.frames[0]!.pixels)).toEqual([0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0]);
    expect(projectForContent(p, 'selection', 0, null)).toBeNull();
    expect(projectForContent(p, 'selection', 0, { x: 90, y: 0, width: 2, height: 2 })).toBeNull();
    expect(projectForContent(p, 'frame', 0, null)!.project).toBe(p);
  });

  it('cada formato explica por qué no está disponible para un contenido', () => {
    const one = makeProject('hd44780-16x2', [{ pixels: new Uint8Array(80 * 16) }]);
    const reason = (content: 'frame' | 'selection' | 'animation', id: string) =>
      formatChoices(profile('hd44780-16x2'), one, content, true).find((c) => c.exporter.id === id)
        ?.unavailableKey;
    expect(reason('frame', 'gif')).toBe('export.reason.needsAnimation');
    expect(reason('selection', 'arduino-liquidcrystal')).toBe('export.reason.needsFullDisplay');
    expect(reason('animation', 'png')).toBe('export.reason.singleFrame');
    expect(reason('animation', 'gif')).toBe('export.reason.needsFrames');
    expect(reason('frame', 'png')).toBeNull();
    // Sin experimentales no aparece XC8; con conexión I²C solo LiquidCrystal_I2C.
    expect(
      formatChoices(profile('hd44780-16x2'), one, 'frame', false).some(
        (c) => c.exporter.id === 'pic-xc8',
      ),
    ).toBe(false);
    const i2c = setDevice(one, {
      connection: 'hd44780-i2c-pcf8574',
      codeTarget: null,
      matrix: null,
    });
    const code = formatChoices(profile('hd44780-16x2'), i2c, 'frame', true)
      .filter((c) => c.group === 'code')
      .map((c) => c.exporter.id);
    expect(code).toEqual(['arduino-liquidcrystal-i2c']);
    expect(optionsForContent({ a: 1 }, 'animation')).toEqual({ a: 1, frames: 'all' });
    expect(optionsForContent({}, 'frame')).toEqual({ frames: 'current' });
  });
});

describe('exportadores según la conexión del proyecto', () => {
  it('XC8 fija el bus de la conexión y solo ofrece ese', () => {
    const xc8 = getExporter('pic-xc8')!;
    for (const [connection, bus] of [
      ['hd44780-8bit', '8'],
      ['hd44780-4bit', '4'],
    ] as const) {
      const p = setDevice(createProject({ name: 'x', profileId: 'hd44780-16x2' }), {
        connection,
        codeTarget: 'pic-xc8',
        matrix: null,
      });
      const ctx = ctxFor(p);
      const o = xc8.normalize({ bus: bus === '8' ? '4' : '8' }, ctx) as { bus: string };
      expect(o.bus).toBe(bus);
      const field = xc8.fields(ctx, o as never).find((f) => f.key === 'bus');
      expect(field && 'choices' in field ? field.choices.map((c) => c.value) : []).toEqual([bus]);
    }
  });

  it('el boceto SSD1306 por I²C no se ofrece con conexión SPI', () => {
    const p = setDevice(createProject({ name: 'x', profileId: 'ssd1306-128x64' }), {
      connection: 'spi',
      codeTarget: null,
      matrix: null,
    });
    for (const id of ['adafruit-gfx', 'u8g2-xbm']) {
      const e = getExporter(id)!;
      const o = e.normalize({ sketch: true }, ctxFor(p)) as { sketch: boolean };
      expect(o.sketch).toBe(false);
      expect(e.fields(ctxFor(p), o as never).some((f) => f.key === 'sketch')).toBe(false);
    }
  });

  it('MAX7219: opciones, identificador no válido y pines repetidos', () => {
    const p = createProject({ name: 'x', profileId: 'max7219-8x8' });
    const data = getExporter('max7219-registers')!;
    const c = data.normalize({ format: 'c-array', identifier: '9mal' }, ctxFor(p));
    expect(data.fields(ctxFor(p), c).map((f) => f.key)).toEqual(['format', 'identifier']);
    expect(data.validate(ctxFor(p), c).some((d) => d.code === 'export.invalidIdentifier')).toBe(
      true,
    );
    expect(data.estimate(ctxFor(p), c).outputBytes).toBeGreaterThan(8);
    const sketch = getExporter('arduino-max7219')!;
    const o = sketch.normalize({ pins: { din: 5, clk: 5, cs: 99 } }, ctxFor(p));
    const codes = sketch.validate(ctxFor(p), o).map((d) => d.code);
    expect(codes).toContain('pins.duplicate');
    expect(sketch.fields(ctxFor(p), o)).toHaveLength(5);
    expect(sketch.estimate(ctxFor(p), o).flashBytes).toBeGreaterThan(0);
  });
});
