import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { encodeBase64 } from '../../../src/core/base64.ts';
import { packBits } from '../../../src/core/bitpack.ts';
import { LIMITS } from '../../../src/core/limits.ts';
import {
  parseProjectFile,
  parseProjectJson,
  serializeProject,
  SCHEMA_VERSION,
} from '../../../src/core/project-format.ts';
import {
  createProject,
  insertBlankFrame,
  replaceFramePixels,
  setAppearance,
  setLoopMode,
  setDevice,
  setRomCharset,
  type Project,
} from '../../../src/core/project.ts';
import { makeV1, toBytes } from '../../helpers/v1.ts';

const GEN = { name: 'LCD Studio', version: '1.0.0' };
const fixture = (name: string) => new Uint8Array(readFileSync(`tests/fixtures/projects/${name}`));

function sample(): Project {
  let p = createProject({ name: 'Animación ñ', profileId: 'hd44780-20x4' });
  const px = new Uint8Array(p.width * p.height);
  for (let i = 0; i < px.length; i += 7) px[i] = 1;
  p = replaceFramePixels(p, 0, px);
  p = insertBlankFrame(p, 1, 1234);
  p = setLoopMode(p, 'once');
  p = setRomCharset(p, 'hd44780-a00');
  p = setAppearance(p, {
    palette: 'custom',
    colors: { frame: '#010203', screen: '#0a0b0c', off: '#a0b0c0', on: '#ffeedd' },
  });
  return p;
}

/** Documento actual (v3) del proyecto, para manipularlo en las pruebas. */
function v2Doc(p: Project = sample()): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(serializeProject(p, GEN))) as Record<string, unknown>;
}

function parse(doc: unknown) {
  return parseProjectFile(toBytes(doc));
}

describe('formato v3', () => {
  it('ida y vuelta conserva todo el proyecto', () => {
    const p = sample();
    const result = parseProjectFile(serializeProject(p, GEN));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const q = result.value;
    expect(q.name).toBe(p.name);
    expect(q.profileId).toBe(p.profileId);
    expect([q.width, q.height]).toEqual([p.width, p.height]);
    expect(q.appearance).toEqual(p.appearance);
    expect(q.loopMode).toBe('once');
    expect(q.romCharset).toBe('hd44780-a00');
    expect(q.frames.map((f) => f.durationMs)).toEqual([200, 1234]);
    q.frames.forEach((f, i) => expect(f.pixels).toEqual(p.frames[i]!.pixels));
  });

  it('serializa de forma determinista y legible', () => {
    const p = sample();
    const a = serializeProject(p, GEN);
    expect(serializeProject(p, GEN)).toEqual(a);
    const text = new TextDecoder().decode(a);
    expect(text.startsWith('{\n  "format": "lcd-studio-project",\n  "schemaVersion": 3')).toBe(
      true,
    );
    expect(text.endsWith('}\n')).toBe(true);
  });

  it('rechaza proyectos inválidos al serializar', () => {
    expect(() => serializeProject({ ...sample(), name: '' }, GEN)).toThrow();
  });

  it('acepta paletas predefinidas y rechaza colores mal formados', () => {
    const doc = v2Doc();
    doc['appearance'] = { palette: 'amber' };
    expect(parse(doc).ok).toBe(true);
    doc['appearance'] = { palette: 'amber', colors: {} };
    expect(parse(doc).ok).toBe(false);
    doc['appearance'] = {
      palette: 'custom',
      colors: { frame: '#FFF', screen: '#000000', off: '#000000', on: '#000000' },
    };
    expect(parse(doc).ok).toBe(false);
  });

  const mutations: [string, (d: Record<string, unknown>) => void, RegExp][] = [
    ['versión futura', (d) => (d['schemaVersion'] = 4), /newerVersion/],
    ['sin dispositivo (v3)', (d) => delete d['device'], /schema/],
    [
      'conexión que el perfil no admite',
      (d) => (d['device'] = { connection: 'i2c', codeTarget: null, matrix: null }),
      /device.invalidConnection/,
    ],
    [
      'destino de código incompatible con la conexión',
      (d) =>
        (d['device'] = {
          connection: 'hd44780-8bit',
          codeTarget: 'arduino-liquidcrystal',
          matrix: null,
        }),
      /device.invalidTarget/,
    ],
    [
      'configuración de matriz en un LCD',
      (d) =>
        (d['device'] = {
          connection: null,
          codeTarget: null,
          matrix: { rotation: 0, wiring: 'rows-msb-left', brightness: 3 },
        }),
      /device.invalidMatrix/,
    ],
    ['versión desconocida', (d) => (d['schemaVersion'] = 1.5), /unknownVersion/],
    ['formato desconocido', (d) => (d['format'] = 'otro'), /unknownFormat/],
    ['clave extra', (d) => (d['extra'] = 1), /schema/],
    ['perfil inexistente', (d) => (d['profile'] = 'hd44780-40x2'), /unknownProfile/],
    ['ancho incoherente con el perfil', (d) => (d['width'] = 99), /sizeMismatch/],
    ['ancho no entero', (d) => (d['width'] = 100.5), /schema/],
    ['ancho excesivo', (d) => (d['width'] = 513), /schema/],
    ['ancho negativo', (d) => (d['width'] = -100), /schema/],
    ['ancho como texto', (d) => (d['width'] = '100'), /schema/],
    ['nombre vacío', (d) => (d['name'] = ''), /schema/],
    ['nombre con control', (d) => (d['name'] = 'a\u0001b'), /invalidName/],
    ['ROM inexistente', (d) => (d['romCharset'] = 'a02'), /schema/],
    ['bucle inválido', (d) => (d['playback'] = { loop: 'forever' }), /schema/],
    ['sin fotogramas', (d) => (d['frames'] = []), /schema/],
    ['codificación desconocida', (d) => (d['pixelEncoding'] = 'rle'), /schema/],
    [
      'duración corta',
      (d) => ((d['frames'] as { durationMs: number }[])[0]!.durationMs = 19),
      /schema/,
    ],
    [
      'duración no finita',
      (d) => ((d['frames'] as { durationMs: unknown }[])[0]!.durationMs = null),
      /schema/,
    ],
    [
      'bitmap truncado',
      (d) => {
        const f = (d['frames'] as { pixels: string }[])[0]!;
        f.pixels = f.pixels.slice(0, -4);
      },
      /pixelLength/,
    ],
    [
      'base64 con carácter inválido',
      (d) => {
        const f = (d['frames'] as { pixels: string }[])[0]!;
        f.pixels = `*${f.pixels.slice(1)}`;
      },
      /base64/,
    ],
  ];

  it.each(mutations)('rechaza: %s', (_label, mutate, code) => {
    const doc = v2Doc();
    mutate(doc);
    const result = parse(doc);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors.map((e) => e.code).join(' ')).toMatch(code);
  });

  it('rechaza bits de relleno manipulados', () => {
    let p = createProject({ name: 'x', profileId: 'graphic-custom', width: 3, height: 3 });
    p = replaceFramePixels(p, 0, new Uint8Array(9).fill(1));
    const doc = v2Doc(p);
    const packed = packBits(new Uint8Array(9).fill(1));
    packed[1] = 0xff; // 7 bits de relleno encendidos
    (doc['frames'] as { pixels: string }[])[0]!.pixels = encodeBase64(packed);
    const result = parse(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.code).toBe('bitpack.nonZeroPadding');
  });

  it('rechaza ROM en pantallas gráficas', () => {
    const doc = v2Doc(createProject({ name: 'g', profileId: 'ssd1306-128x64' }));
    doc['romCharset'] = 'hd44780-a00';
    expect(parse(doc).ok).toBe(false);
  });

  it('rechaza más de 240 fotogramas antes de validar cada uno', () => {
    const doc = v2Doc();
    const frames = doc['frames'] as unknown[];
    doc['frames'] = Array.from({ length: LIMITS.maxFrames + 1 }, () => frames[0]);
    const result = parse(doc);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]!.code).toBe('project.tooManyFrames');
  });

  // Prueba de carga (60 MB de píxeles): con cobertura o en máquinas lentas supera los 5 s por omisión.
  it('acepta exactamente 240 fotogramas de 512×512', () => {
    const p = createProject({ name: 'max', profileId: 'graphic-custom', width: 512, height: 512 });
    const doc = v2Doc(p);
    const frames = doc['frames'] as unknown[];
    doc['frames'] = Array.from({ length: 240 }, () => frames[0]);
    const bytes = toBytes(doc);
    expect(bytes.length).toBeLessThan(LIMITS.projectMaxFileBytes);
    const result = parseProjectFile(bytes);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.frames).toHaveLength(240);
  }, 30_000);

  it('rechaza archivos vacíos, enormes, no UTF-8 y no JSON', () => {
    expect(parseProjectFile(new Uint8Array(0))).toMatchObject({ ok: false });
    const huge = new Uint8Array(LIMITS.projectMaxFileBytes + 1);
    const big = parseProjectFile(huge);
    expect(big.ok).toBe(false);
    if (!big.ok) expect(big.errors[0]!.code).toBe('project.fileTooLarge');
    const bad = parseProjectFile(Uint8Array.from([0x7b, 0xff, 0xfe, 0x7d]));
    if (!bad.ok) expect(bad.errors[0]!.code).toBe('project.encoding');
    const notJson = parseProjectFile(new TextEncoder().encode('{"a":'));
    if (!notJson.ok) expect(notJson.errors[0]!.code).toBe('project.json');
    expect(parseProjectJson([1, 2])).toMatchObject({ ok: false });
    expect(parseProjectJson(null)).toMatchObject({ ok: false });
    expect(parseProjectJson('texto')).toMatchObject({ ok: false });
  });

  it('declara la versión de esquema 3', () => {
    expect(SCHEMA_VERSION).toBe(3);
    expect(v2Doc()['schemaVersion']).toBe(3);
  });

  it('guarda y restaura la configuración del dispositivo', () => {
    const p = setDevice(sample(), {
      connection: 'hd44780-4bit',
      codeTarget: 'arduino-liquidcrystal',
      matrix: null,
    });
    const r = parseProjectFile(serializeProject(p, GEN));
    expect(r.ok && r.value.device).toEqual(p.device);
    const led = setDevice(createProject({ name: 'm', profileId: 'max7219-8x8' }), {
      connection: 'max7219-spi',
      codeTarget: 'arduino-max7219',
      matrix: { rotation: 270, wiring: 'cols-lsb-top', brightness: 15 },
    });
    const r2 = parseProjectFile(serializeProject(led, GEN));
    expect(r2.ok && r2.value.device).toEqual(led.device);
  });
});

describe('migración v2 → v3', () => {
  it('un proyecto v2 se abre completo con el dispositivo sin configurar', () => {
    const p = sample();
    const doc = v2Doc(p);
    delete doc['device'];
    doc['schemaVersion'] = 2;
    const r = parse(doc);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.warnings.map((w) => w.code)).toEqual(['migration.fromV2']);
    expect(r.value.device).toEqual({ connection: null, codeTarget: null, matrix: null });
    expect(r.value.romCharset).toBe('hd44780-a00');
    expect(r.value.appearance).toEqual(p.appearance);
    r.value.frames.forEach((f, i) => expect(f.pixels).toEqual(p.frames[i]!.pixels));
    // Al volver a guardar se escribe en v3.
    expect(v2Doc(r.value)['schemaVersion']).toBe(3);
  });

  it('un v2 con la clave device se rechaza (no pertenece a ese esquema)', () => {
    const doc = v2Doc();
    doc['schemaVersion'] = 2;
    expect(parse(doc).ok).toBe(false);
  });
});

describe('migración v1', () => {
  it('migra un 16×2 válido del prototipo', () => {
    const result = parseProjectFile(fixture('v1-valid-16x2.lcdstudio.json'), {
      fileName: 'cara.lcdstudio.json',
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const p = result.value;
    expect(p.profileId).toBe('hd44780-16x2');
    expect(p.name).toBe('cara');
    expect(p.frames).toHaveLength(2);
    expect(p.frames[0]!.durationMs).toBe(250);
    // La duración de 10 ms del prototipo se lleva al mínimo de 20 ms con aviso.
    expect(p.frames[1]!.durationMs).toBe(20);
    expect(result.warnings.map((w) => w.code)).toEqual([
      'migration.fromV1',
      'migration.durationClamped',
    ]);
    expect(p.frames[0]!.pixels[1 * 80 + 1]).toBe(1);
    expect(p.frames[0]!.pixels[0]).toBe(0);
    expect(p.frames[1]!.pixels[0]).toBe(1);
    expect(p.loopMode).toBe('loop');
    expect(p.romCharset).toBe('none');
  });

  it('migra el tema personalizado y gráficos de tamaño libre', () => {
    const result = parseProjectFile(fixture('v1-valid-gfx-custom.lcdstudio.json'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.profileId).toBe('graphic-custom');
    expect([result.value.width, result.value.height]).toEqual([37, 13]);
    expect(result.value.appearance).toEqual({
      palette: 'custom',
      colors: { frame: '#202020', screen: '#3a7bd5', off: '#4a88e0', on: '#ffffff' },
    });
    expect(result.value.name).toBe('proyecto migrado');
  });

  it('convierte perfiles de caracteres eliminados en gráfico con aviso', () => {
    const result = parseProjectFile(fixture('v1-valid-40x2.lcdstudio.json'));
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.profileId).toBe('graphic-custom');
    expect([result.value.width, result.value.height]).toEqual([200, 16]);
    expect(result.value.appearance).toEqual({ palette: 'blue' });
    expect(result.warnings.some((w) => w.code === 'migration.charProfileUnsupported')).toBe(true);
  });

  it('mapea Nokia 5110 y temas renombrados', () => {
    const doc = makeV1({ kind: 'gfx', w: 84, h: 48, preset: 'g84x48', theme: 'oledb' });
    const result = parse(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.profileId).toBe('pcd8544-84x48');
    expect(result.value.appearance).toEqual({ palette: 'oled-blue' });
  });

  it('usa valores por omisión documentados con avisos', () => {
    const doc = makeV1({
      theme: 'inexistente',
      frames: [{ d: 0, px: new Array(80 * 16).fill(0) }],
    });
    const result = parse(doc);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.frames[0]!.durationMs).toBe(200);
    expect(result.warnings.map((w) => w.code)).toEqual(
      expect.arrayContaining(['migration.unknownTheme', 'migration.durationDefaulted']),
    );
  });

  it.each([
    ['v1-damaged.lcdstudio.json', 'project.json'],
    ['v1-truncated.lcdstudio.json', 'project.json'],
    ['v1-oversized-frames.lcdstudio.json', 'project.tooManyFrames'],
    ['v1-oversized-canvas.lcdstudio.json', 'project.v1Schema'],
    ['v1-manipulated-length.lcdstudio.json', 'bitpack.lengthMismatch'],
    ['v1-manipulated-dims.lcdstudio.json', 'project.sizeMismatch'],
    ['v1-manipulated-proto.lcdstudio.json', 'project.v1Schema'],
  ])('rechaza %s sin abrirlo parcialmente', (name, code) => {
    const result = parseProjectFile(fixture(name));
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors[0]!.code).toBe(code);
    expect(({} as Record<string, unknown>)['polluted']).toBeUndefined();
  });

  it('rechaza tipos incorrectos y temas personalizados inválidos', () => {
    const doc = makeV1();
    (doc['frames'] as { d: unknown }[])[0]!.d = '200';
    expect(parse(doc).ok).toBe(false);
    const custom = makeV1({ theme: 'custom' });
    (custom['custom'] as Record<string, string>)['on'] = 'rojo';
    expect(parse(custom).ok).toBe(false);
    const missing = makeV1({ theme: 'custom' });
    delete missing['custom'];
    expect(parse(missing).ok).toBe(false);
    const fraction = makeV1();
    (fraction['frames'] as { d: number }[])[0]!.d = 200.5;
    expect(parse(fraction).ok).toBe(false);
  });

  it('rechaza base64 válida con bits de relleno alterados', () => {
    const doc = makeV1({ kind: 'gfx', w: 3, h: 3, preset: 'xgfx', frames: [{ d: 100, px: [1] }] });
    (doc['frames'] as { b: string }[])[0]!.b = Buffer.from([0xff, 0xff]).toString('base64');
    const result = parse(doc);
    expect(result.ok).toBe(false);
  });
});
