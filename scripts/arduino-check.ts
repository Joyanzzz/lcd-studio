/**
 * Genera una matriz de bocetos Arduino con los exportadores reales y, si se
 * indica `ARDUINO_CLI`, los compila y compara la memoria estimada con la real.
 *
 *   node scripts/arduino-check.ts                 # solo genera build/arduino-fixtures
 *   ARDUINO_CLI=arduino-cli node scripts/arduino-check.ts
 *   ARDUINO_CLI=... ARDUINO_CONFIG=.tools/arduino-cli.yaml node scripts/arduino-check.ts
 *
 * Sale con código 1 si un boceto no compila o si la estimación de flash/RAM
 * queda por debajo del valor real.
 */
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { ledDiagnosticFrames } from '../src/core/led-diagnostics.ts';
import {
  createFrame,
  createProject,
  insertFrames,
  replaceFramePixels,
  setDevice,
  setLoopMode,
  type LoopMode,
  type Project,
} from '../src/core/project.ts';
import { getProfile, type CharacterProfile } from '../src/device-profiles/index.ts';
import { getArduinoBoard } from '../src/device-profiles/mcu.ts';
import { getExporter, runExport } from '../src/exporters/index.ts';
import type { ExportContext } from '../src/exporters/types.ts';

const OUT = 'build/arduino-fixtures';

interface Case {
  readonly name: string;
  readonly exporter: string;
  readonly project: Project;
  readonly options: Record<string, unknown>;
  readonly board: string;
  /** Envoltorio para compilar archivos .h (se incluye y se referencian las tablas). */
  readonly wrapper?: (header: string) => string;
}

function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function graphicProject(
  profileId: string,
  frames: number,
  mode: LoopMode,
  size?: { width: number; height: number },
): Project {
  let p = createProject({ name: 'Prueba', profileId, ...(size ?? {}) });
  const rnd = seeded(frames * 31 + p.width);
  const make = () => {
    const px = new Uint8Array(p.width * p.height);
    for (let i = 0; i < px.length; i++) px[i] = rnd() < 0.3 ? 1 : 0;
    return px;
  };
  p = replaceFramePixels(p, 0, make());
  if (frames > 1)
    p = insertFrames(
      p,
      1,
      Array.from({ length: frames - 1 }, (_, i) => createFrame(make(), 50 + i * 10)),
    );
  return setLoopMode(p, mode);
}

/** Proyecto de caracteres con `glyphsPerFrame` glifos distintos por fotograma. */
function charProject(
  profileId: string,
  frames: number,
  mode: LoopMode,
  glyphsPerFrame = 5,
): Project {
  const profile = getProfile(profileId) as CharacterProfile;
  let p = createProject({ name: 'Prueba', profileId });
  const make = (f: number) => {
    const px = new Uint8Array(p.width * p.height);
    for (let g = 0; g < glyphsPerFrame; g++) {
      const id = f * glyphsPerFrame + g + 1;
      const row = g % profile.rows;
      const col = (g * 3) % profile.columns;
      const rows = [id & 31, (id >> 5) & 31, 31, 0, 17, 0, 0, 0];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < 5; x++)
          if (rows[y]! & (0x10 >> x)) px[(row * 8 + y) * p.width + col * 5 + x] = 1;
      }
    }
    return px;
  };
  p = replaceFramePixels(p, 0, make(0));
  if (frames > 1)
    p = insertFrames(
      p,
      1,
      Array.from({ length: frames - 1 }, (_, i) => createFrame(make(i + 1), 120)),
    );
  return setLoopMode(p, mode);
}

/** Matriz 8×8 con los patrones de diagnóstico y la orientación/cableado indicados. */
function ledProject(
  mode: LoopMode,
  rotation: 0 | 90 | 180 | 270,
  wiring: 'rows-msb-left' | 'rows-lsb-left' | 'cols-msb-top' | 'cols-lsb-top',
  frames = ledDiagnosticFrames().length,
): Project {
  let p = createProject({ name: 'Prueba', profileId: 'max7219-8x8' });
  const diag = ledDiagnosticFrames().slice(0, frames);
  p = replaceFramePixels(p, 0, diag[0]!.pixels);
  if (diag.length > 1)
    p = insertFrames(
      p,
      1,
      diag.slice(1).map((f) => createFrame(f.pixels, f.durationMs)),
    );
  p = setDevice(p, {
    connection: 'max7219-spi',
    codeTarget: 'arduino-max7219',
    matrix: { rotation, wiring, brightness: 6 },
  });
  return setLoopMode(p, mode);
}

const headerWrapper =
  (name: string, body: string) =>
  (header: string): string =>
    `#include "${header}"\n\nvolatile uint8_t sink;\n\nvoid setup() {\n${body}\n}\n\nvoid loop() {}\n// ${name}\n`;

const cases: Case[] = [];
for (const profileId of ['hd44780-16x2', 'hd44780-20x4', 'hd44780-16x4']) {
  for (const mode of ['loop', 'once', 'pingpong'] as const) {
    for (const progmem of [true, false]) {
      cases.push({
        name: `lc_${profileId.slice(8)}_${mode}_${progmem ? 'pgm' : 'ram'}`,
        exporter: 'arduino-liquidcrystal',
        project: charProject(profileId, 6, mode),
        options: { progmem, board: 'arduino-uno', identifier: 'animacion' },
        board: 'arduino-uno',
      });
    }
  }
}
cases.push(
  {
    name: 'lc_16x2_single',
    exporter: 'arduino-liquidcrystal',
    project: charProject('hd44780-16x2', 1, 'loop'),
    options: { identifier: 'animacion' },
    board: 'arduino-uno',
  },
  {
    name: 'lc_16x2_wide_index_mega',
    exporter: 'arduino-liquidcrystal',
    project: charProject('hd44780-16x2', 40, 'loop', 8),
    options: { board: 'arduino-mega2560', identifier: 'animacion' },
    board: 'arduino-mega2560',
  },
  {
    name: 'lci2c_16x2_once',
    exporter: 'arduino-liquidcrystal-i2c',
    project: charProject('hd44780-16x2', 4, 'once'),
    options: { i2cAddress: 0x27, identifier: 'animacion' },
    board: 'arduino-uno',
  },
  {
    name: 'lci2c_20x4_pingpong_ram',
    exporter: 'arduino-liquidcrystal-i2c',
    project: charProject('hd44780-20x4', 4, 'pingpong'),
    options: { progmem: false, i2cAddress: 0x3f, identifier: 'animacion' },
    board: 'arduino-uno',
  },
  {
    name: 'lci2c_16x4_loop_nano',
    exporter: 'arduino-liquidcrystal-i2c',
    project: charProject('hd44780-16x4', 8, 'loop'),
    options: { board: 'arduino-nano', identifier: 'animacion' },
    board: 'arduino-nano',
  },
  {
    name: 'gfx_ssd1306_128x64_loop',
    exporter: 'adafruit-gfx',
    project: graphicProject('ssd1306-128x64', 6, 'loop'),
    options: { sketch: true, identifier: 'animacion' },
    board: 'arduino-uno',
  },
  {
    name: 'gfx_ssd1306_128x32_once_mega',
    exporter: 'adafruit-gfx',
    project: graphicProject('ssd1306-128x32', 30, 'once'),
    options: { sketch: true, board: 'arduino-mega2560', i2cAddress: 0x3d, identifier: 'animacion' },
    board: 'arduino-mega2560',
  },
  {
    name: 'gfx_header_custom',
    exporter: 'adafruit-gfx',
    project: graphicProject('graphic-custom', 3, 'loop', { width: 37, height: 13 }),
    options: { identifier: 'animacion' },
    board: 'arduino-uno',
    wrapper: headerWrapper(
      'gfx',
      '  const uint8_t *p = (const uint8_t *)pgm_read_ptr(&animacion_frames[2]);\n  sink = pgm_read_byte(p + ANIMACION_BYTES_PER_FRAME - 1) + pgm_read_word(&animacion_durations_ms[0]);',
    ),
  },
  {
    name: 'u8g2_128x64_pingpong',
    exporter: 'u8g2-xbm',
    project: graphicProject('ssd1306-128x64', 4, 'pingpong'),
    options: { sketch: true, identifier: 'animacion' },
    board: 'arduino-uno',
  },
  {
    name: 'u8g2_128x32_loop_ram',
    exporter: 'u8g2-xbm',
    project: graphicProject('ssd1306-128x32', 1, 'loop'),
    options: { sketch: true, progmem: false, identifier: 'animacion' },
    board: 'arduino-uno',
  },
  {
    name: 'u8g2_header_ram',
    exporter: 'u8g2-xbm',
    project: graphicProject('graphic-custom', 2, 'loop', { width: 20, height: 9 }),
    options: { progmem: false, identifier: 'animacion' },
    board: 'arduino-uno',
    wrapper: headerWrapper(
      'u8g2',
      '  sink = animacion_frames[1][ANIMACION_BYTES_PER_FRAME - 1] + animacion_durations_ms[1];',
    ),
  },
  {
    name: 'pages_header_pgm',
    exporter: 'vertical-pages',
    project: graphicProject('pcd8544-84x48', 3, 'loop'),
    options: { identifier: 'animacion' },
    board: 'arduino-uno',
    wrapper: headerWrapper(
      'pages',
      '  const uint8_t *p = (const uint8_t *)pgm_read_ptr(&animacion_frames[0]);\n  sink = pgm_read_byte(p + ANIMACION_PAGES * ANIMACION_WIDTH - 1);',
    ),
  },
  {
    name: 'max7219_loop_uno',
    exporter: 'arduino-max7219',
    project: ledProject('loop', 0, 'rows-msb-left'),
    options: { identifier: 'animacion' },
    board: 'arduino-uno',
  },
  {
    name: 'max7219_once_nano_r90',
    exporter: 'arduino-max7219',
    project: ledProject('once', 90, 'cols-msb-top'),
    options: { board: 'arduino-nano', identifier: 'animacion', pins: { din: 2, clk: 3, cs: 4 } },
    board: 'arduino-nano',
  },
  {
    name: 'max7219_pingpong_mega_r270',
    exporter: 'arduino-max7219',
    project: ledProject('pingpong', 270, 'rows-lsb-left'),
    options: { board: 'arduino-mega2560', identifier: 'animacion' },
    board: 'arduino-mega2560',
  },
  {
    name: 'max7219_single_r180',
    exporter: 'arduino-max7219',
    project: ledProject('loop', 180, 'cols-lsb-top', 1),
    options: { identifier: 'animacion' },
    board: 'arduino-uno',
  },
  {
    name: 'max7219_registers_header',
    exporter: 'max7219-registers',
    project: ledProject('loop', 0, 'rows-msb-left'),
    options: { format: 'c-array', identifier: 'animacion' },
    board: 'arduino-uno',
    wrapper: headerWrapper(
      'max7219',
      '  sink = animacion_digits[ANIMACION_FRAME_COUNT * 8u - 1] + animacion_durations_ms[0];',
    ),
  },
  {
    name: 'chars_header',
    exporter: 'custom-chars',
    project: charProject('hd44780-16x2', 2, 'loop'),
    options: { frames: 'all', identifier: 'animacion' },
    board: 'arduino-uno',
    wrapper: headerWrapper('chars', '  sink = animacion_char_0[7] + ANIMACION_CHAR_COUNT;'),
  },
);

interface Result {
  name: string;
  exporter: string;
  board: string;
  estimateFlash?: number;
  estimateRam?: number;
  actualFlash?: number | undefined;
  actualRam?: number | undefined;
  compiled?: boolean;
  error?: string;
}

rmSync(OUT, { recursive: true, force: true });
const results: Result[] = [];
const cli = process.env['ARDUINO_CLI'];
const config = process.env['ARDUINO_CONFIG'];
let failures = 0;

for (const c of cases) {
  const exporter = getExporter(c.exporter)!;
  const ctx: ExportContext = {
    project: c.project,
    profile: getProfile(c.project.profileId)!,
    currentFrame: 0,
    appVersion: 'fixture',
  };
  const outcome = runExport(exporter, ctx, c.options);
  const result: Result = { name: c.name, exporter: c.exporter, board: c.board };
  results.push(result);
  if (!outcome.files) {
    result.error = `Exportación bloqueada: ${JSON.stringify(outcome.diagnostics)}`;
    failures++;
    continue;
  }
  if (outcome.estimate.flashBytes !== undefined) result.estimateFlash = outcome.estimate.flashBytes;
  if (outcome.estimate.ramBytes !== undefined) result.estimateRam = outcome.estimate.ramBytes;
  const dir = join(OUT, c.name);
  mkdirSync(dir, { recursive: true });
  for (const f of outcome.files) {
    if (f.name.endsWith('.ino')) writeFileSync(join(dir, `${c.name}.ino`), f.data);
    else writeFileSync(join(dir, f.name), f.data);
  }
  if (c.wrapper) writeFileSync(join(dir, `${c.name}.ino`), c.wrapper(outcome.files[0]!.name));

  if (!cli) continue;
  const fqbn = getArduinoBoard(c.board)!.fqbn;
  try {
    const args = [
      ...(config ? ['--config-file', config] : []),
      'compile',
      '--fqbn',
      fqbn,
      '--warnings',
      'default',
      '--json',
      dir,
    ];
    const json = JSON.parse(
      execFileSync(cli, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 }),
    ) as {
      success?: boolean;
      builder_result?: { executable_sections_size?: { name: string; size: number }[] };
      compiler_err?: string;
    };
    result.compiled = json.success === true;
    const sections = json.builder_result?.executable_sections_size ?? [];
    result.actualFlash = sections.find((s) => s.name === 'text')?.size;
    result.actualRam = sections.find((s) => s.name === 'data')?.size;
    if (!result.compiled) {
      result.error = json.compiler_err ?? 'falló la compilación';
      failures++;
    } else if (
      (result.estimateFlash !== undefined &&
        result.actualFlash !== undefined &&
        result.estimateFlash < result.actualFlash) ||
      (result.estimateRam !== undefined &&
        result.actualRam !== undefined &&
        result.estimateRam < result.actualRam)
    ) {
      result.error = 'La estimación de memoria es menor que el valor real';
      failures++;
    }
  } catch (error) {
    const e = error as { stdout?: string; message: string };
    result.compiled = false;
    result.error = (e.stdout ?? e.message).slice(0, 4000);
    failures++;
  }
}

mkdirSync('build', { recursive: true });
writeFileSync('build/arduino-report.json', `${JSON.stringify(results, null, 2)}\n`);
for (const r of results) {
  const status = r.error ? 'FALLO' : cli ? 'OK' : 'generado';
  console.log(
    `${status.padEnd(9)} ${r.name.padEnd(32)} ${r.board.padEnd(17)} flash ${r.actualFlash ?? '-'}/${r.estimateFlash ?? '-'}  ram ${r.actualRam ?? '-'}/${r.estimateRam ?? '-'}`,
  );
  if (r.error) console.log(`          ${r.error.split('\n').slice(0, 12).join('\n          ')}`);
}
console.log(
  `\n${results.length} casos, ${failures} fallos${cli ? '' : ' (sin compilar: define ARDUINO_CLI)'}`,
);
process.exit(failures > 0 ? 1 : 0);
