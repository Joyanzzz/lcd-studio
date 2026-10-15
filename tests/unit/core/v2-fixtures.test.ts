import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseProjectFile, serializeProject } from '../../../src/core/project-format.ts';

/**
 * Archivos v2 reales, escritos por el serializador de LCD Studio 1.0.0
 * (commit d8cb46d), no construidos con el formato actual.
 */

const fixture = (name: string) =>
  new Uint8Array(readFileSync(`tests/fixtures/projects/${name}.lcdstudio.json`));

const gen = { name: 'LCD Studio', version: 'test' };

describe('proyectos v2 escritos por la versión 1.0.0', () => {
  it('20×4 de caracteres: dibujo, duraciones, bucle, ROM y colores intactos', () => {
    const result = parseProjectFile(fixture('v2-char-20x4-anim'));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    expect(result.warnings.map((w) => w.code)).toEqual(['migration.fromV2']);
    const p = result.value;
    expect(p).toMatchObject({
      name: 'Reloj 20x4',
      profileId: 'hd44780-20x4',
      width: 100,
      height: 32,
      loopMode: 'pingpong',
      romCharset: 'hd44780-a00',
      appearance: {
        palette: 'custom',
        colors: { frame: '#202020', screen: '#304030', off: '#405040', on: '#e0ffe0' },
      },
    });
    expect(p.frames.map((f) => f.durationMs)).toEqual([200, 20, 60_000]);
    p.frames.forEach((f, k) => {
      const expected = new Uint8Array(100 * 32);
      for (let i = 0; i < expected.length; i++) if ((i * (k + 3) + k) % 11 === 0) expected[i] = 1;
      expect(f.pixels).toEqual(expected);
    });
    // Sin configuración de conexión ni código: se elige después.
    expect(p.device.connection).toBeNull();
    expect(p.device.codeTarget).toBeNull();
  });

  it('gráfico 37×23: tamaño no múltiplo de 8 y modo «una vez»', () => {
    const result = parseProjectFile(fixture('v2-graphic-37x23'));
    if (!result.ok) throw new Error(JSON.stringify(result.errors));
    const p = result.value;
    expect(p).toMatchObject({ profileId: 'graphic-custom', width: 37, height: 23 });
    expect(p.loopMode).toBe('once');
    expect(p.frames.map((f) => f.durationMs)).toEqual([200, 333]);
    const diag = new Uint8Array(37 * 23);
    for (let y = 0; y < 23; y++)
      for (let x = 0; x < 37; x++) if (x === y || x + y === 36) diag[y * 37 + x] = 1;
    expect(p.frames[0]!.pixels).toEqual(diag);
    expect(p.frames[1]!.pixels).toEqual(diag.map((v) => 1 - v));
  });

  it('guardar en v3 y volver a abrir conserva exactamente el proyecto migrado', () => {
    for (const name of ['v2-char-20x4-anim', 'v2-graphic-37x23']) {
      const first = parseProjectFile(fixture(name));
      if (!first.ok) throw new Error(name);
      const again = parseProjectFile(serializeProject(first.value, gen));
      if (!again.ok) throw new Error(name);
      expect(again.warnings).toEqual([]);
      const strip = (p: typeof first.value) => ({
        ...p,
        frames: p.frames.map((f) => ({ durationMs: f.durationMs, pixels: f.pixels })),
      });
      expect(strip(again.value)).toEqual(strip(first.value));
    }
  });

  it('un v2 dañado se rechaza entero, sin abrir una parte', () => {
    const text = new TextDecoder().decode(fixture('v2-char-20x4-anim'));
    const damaged = text.replace(/"durationMs": 20,/, '"durationMs": 5,');
    expect(damaged).not.toBe(text);
    const result = parseProjectFile(new TextEncoder().encode(damaged));
    expect(result.ok).toBe(false);
  });
});
