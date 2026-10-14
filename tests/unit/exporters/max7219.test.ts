import { describe, expect, it } from 'vitest';
import type { MatrixConfig } from '../../../src/core/device.ts';
import { ledDiagnosticFrames } from '../../../src/core/led-diagnostics.ts';
import { createProject, setDevice } from '../../../src/core/project.ts';
import {
  MATRIX_ROTATIONS,
  MATRIX_WIRINGS,
  type MatrixRotation,
  type MatrixWiringId,
} from '../../../src/device-profiles/index.ts';
import { getExporter, runExport } from '../../../src/exporters/index.ts';
import {
  moduleImage,
  registerBytes,
  viewerPixelFor,
} from '../../../src/exporters/shared/max7219.ts';
import { ctxFor, makeProject } from '../../helpers/projects.ts';

const cfg = (rotation: MatrixRotation, wiring: MatrixWiringId, brightness = 4): MatrixConfig => ({
  rotation,
  wiring,
  brightness,
});
const diag = (key: string) => ledDiagnosticFrames().find((f) => f.key === key)!.pixels;
const single = (x: number, y: number) => {
  const p = new Uint8Array(64);
  p[y * 8 + x] = 1;
  return p;
};
const hex = (b: Uint8Array) => Array.from(b, (v) => v.toString(16).padStart(2, '0')).join(' ');

/** Simula el módulo: qué LED de referencia (mx, my) enciende cada registro según el cableado. */
function decode(regs: Uint8Array, wiring: MatrixWiringId): Uint8Array {
  const m = new Uint8Array(64);
  for (let d = 0; d < 8; d++) {
    for (let bit = 0; bit < 8; bit++) {
      if (!(regs[d]! & (1 << bit))) continue;
      const msbIndex = 7 - bit;
      const [x, y] =
        wiring === 'rows-msb-left'
          ? [msbIndex, d]
          : wiring === 'rows-lsb-left'
            ? [bit, d]
            : wiring === 'cols-msb-top'
              ? [d, msbIndex]
              : [d, bit];
      m[y * 8 + x] = 1;
    }
  }
  return m;
}

/** Lo que ve el usuario con el módulo girado `rotation` grados en sentido horario. */
function viewed(module: Uint8Array, rotation: MatrixRotation): Uint8Array {
  const v = new Uint8Array(64);
  for (let my = 0; my < 8; my++)
    for (let mx = 0; mx < 8; mx++) {
      if (!module[my * 8 + mx]) continue;
      // Girar un punto 90° en sentido horario: (x, y) → (7 − y, x).
      let [x, y] = [mx, my];
      for (let k = 0; k < rotation / 90; k++) [x, y] = [7 - y, x];
      v[y * 8 + x] = 1;
    }
  return v;
}

describe('MAX7219: orientación física y cableado', () => {
  it('orientación 0° y filas con MSB a la izquierda: bytes conocidos de la flecha', () => {
    expect(hex(registerBytes(diag('orientation'), cfg(0, 'rows-msb-left')))).toBe(
      '80 08 1c 2a 08 08 08 08',
    );
  });

  it('barridos: cada fila o columna enciende exactamente un registro o un bit', () => {
    for (let r = 0; r < 8; r++) {
      const rows = registerBytes(diag(`row${r}`), cfg(0, 'rows-msb-left'));
      expect(Array.from(rows)).toEqual(Array.from({ length: 8 }, (_, d) => (d === r ? 0xff : 0)));
      const cols = registerBytes(diag(`row${r}`), cfg(0, 'cols-lsb-top'));
      expect(Array.from(cols)).toEqual(new Array(8).fill(1 << r));
      const c = registerBytes(diag(`col${r}`), cfg(0, 'cols-msb-top'));
      expect(Array.from(c)).toEqual(Array.from({ length: 8 }, (_, d) => (d === r ? 0xff : 0)));
    }
  });

  it('un módulo girado 90° muestra el píxel superior izquierdo en su sitio', () => {
    // Con el módulo girado 90°, el LED de referencia (0, 7) queda arriba a la izquierda.
    expect(viewerPixelFor(0, 7, 90)).toEqual({ x: 0, y: 0 });
    expect(hex(registerBytes(single(0, 0), cfg(90, 'rows-msb-left')))).toBe(
      '00 00 00 00 00 00 00 80',
    );
  });

  it('para cada giro y cableado, el módulo simulado muestra exactamente el dibujo', () => {
    for (const frame of ledDiagnosticFrames()) {
      for (const rotation of MATRIX_ROTATIONS) {
        for (const wiring of MATRIX_WIRINGS) {
          const regs = registerBytes(frame.pixels, cfg(rotation, wiring));
          const seen = viewed(decode(regs, wiring), rotation);
          expect(Array.from(seen), `${frame.key} ${rotation} ${wiring}`).toEqual(
            Array.from(frame.pixels),
          );
        }
      }
    }
  });

  it('la imagen del módulo no modifica el dibujo original', () => {
    const p = diag('corners');
    const copy = p.slice();
    moduleImage(p, 270);
    expect(p).toEqual(copy);
  });
});

describe('MAX7219: exportadores', () => {
  const project = () => {
    const frames = ledDiagnosticFrames().slice(0, 3);
    let p = makeProject(
      'max7219-8x8',
      frames.map((f) => ({ pixels: f.pixels, durationMs: f.durationMs })),
    );
    p = setDevice(p, {
      connection: 'max7219-spi',
      codeTarget: 'arduino-max7219',
      matrix: cfg(180, 'cols-lsb-top', 9),
    });
    return p;
  };

  it('el boceto incluye registros, duraciones, brillo e inicialización del MAX7219', () => {
    const p = project();
    const out = runExport(getExporter('arduino-max7219')!, ctxFor(p), { frames: 'all' });
    expect(out.diagnostics.filter((d) => d.severity === 'error')).toEqual([]);
    const text = new TextDecoder().decode(out.files![0]!.data);
    const expected = p.frames
      .map((f) => registerBytes(f.pixels, cfg(180, 'cols-lsb-top')))
      .flatMap((b) => Array.from(b, (v) => `0x${v.toString(16).toUpperCase().padStart(2, '0')}`));
    for (const v of expected) expect(text).toContain(v);
    expect(text).toContain('BRIGHTNESS = 9');
    expect(text).toContain('2000, 2000, 400');
    expect(text).toMatch(/max7219Write\(0x0C, 0x01\)/);
    expect(text).toContain('#error');
    expect(text).not.toMatch(/#include <(LedControl|MD_|SPI)/);
  });

  it('los datos binarios son DIG0…DIG7 de cada fotograma en orden', () => {
    const p = project();
    const out = runExport(getExporter('max7219-registers')!, ctxFor(p), { frames: 'all' });
    const bytes = out.files![0]!.data;
    expect(bytes.length).toBe(24);
    p.frames.forEach((f, i) =>
      expect(Array.from(bytes.subarray(i * 8, i * 8 + 8))).toEqual(
        Array.from(registerBytes(f.pixels, cfg(180, 'cols-lsb-top'))),
      ),
    );
    const c = runExport(getExporter('max7219-registers')!, ctxFor(p), {
      frames: 'current',
      format: 'c-array',
    });
    expect(c.files![0]!.name).toMatch(/\.h$/);
  });

  it('solo se ofrecen para matrices de LEDs', () => {
    const lcd = createProject({ name: 'x', profileId: 'hd44780-16x2' });
    expect(getExporter('arduino-max7219')!.supports(ctxFor(lcd).profile)).toBe(false);
  });
});
