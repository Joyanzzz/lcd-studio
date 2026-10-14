import { describe, expect, it } from 'vitest';
import { AppError } from '../../../src/core/errors.ts';
import { readImageHeader } from '../../../src/engine/image/sniff.ts';
import { getArduinoBoard } from '../../../src/device-profiles/mcu.ts';
import { a00GlyphRows7 } from '../../../src/device-profiles/rom/hd44780-a00.ts';
import { getExporter, inspectExport, runExport } from '../../../src/exporters/index.ts';
import { validateAvr } from '../../../src/exporters/shared/avr.ts';
import { hex8 } from '../../../src/exporters/shared/c-source.ts';
import type { Exporter } from '../../../src/exporters/types.ts';
import { charPixels, ctxFor, HEART, makeProject } from '../../helpers/projects.ts';

function exporter(id: string): Exporter<object> {
  const e = getExporter(id);
  if (!e) throw new Error(`Sin exportador ${id}`);
  return e;
}

/** Fotograma 16×2 con nueve glifos distintos: no cabe en la CGRAM. */
function overflowProject() {
  const cells: Record<string, number[]> = {};
  for (let i = 0; i < 9; i++) cells[`0,${i}`] = [i + 1, 0, 0, 0, 0, 0, 0, 0];
  return makeProject('hd44780-16x2', [{ pixels: charPixels(16, 2, cells) }]);
}

describe('ramas defensivas de los exportadores', () => {
  it('runExport e inspectExport convierten excepciones en diagnósticos', () => {
    const ctx = ctxFor(makeProject('ssd1306-128x64', [{ pixels: new Uint8Array(128 * 64) }]));
    const base = exporter('binary');
    const throwing = (error: unknown): Exporter<object> => ({
      ...base,
      validate: () => {
        throw error;
      },
    });
    for (const fn of [runExport, inspectExport]) {
      expect(fn(throwing(new Error('x')), ctx, {}).diagnostics).toEqual([
        { severity: 'error', code: 'export.internal' },
      ]);
      expect(
        fn(throwing(new AppError('limits.overflow', { max: 3 })), ctx, {}).diagnostics,
      ).toEqual([{ severity: 'error', code: 'limits.overflow', params: { max: 3 } }]);
    }
  });

  it('los generadores de caracteres nunca sustituyen celdas si la CGRAM se desborda', () => {
    const ctx = ctxFor(overflowProject());
    for (const id of ['custom-chars', 'arduino-liquidcrystal']) {
      const e = exporter(id);
      const options = e.normalize({ frames: 'all' }, ctx);
      expect(e.validate(ctx, options).some((d) => d.code === 'cgram.overflow')).toBe(true);
      expect(() => e.run(ctx, options)).toThrow(/CGRAM/);
    }
  });

  it('proyecto en reparación: código bloqueado, imágenes disponibles con aviso', () => {
    const ctx = ctxFor(overflowProject());
    const code = runExport(exporter('arduino-liquidcrystal'), ctx, {});
    expect(code.files).toBeUndefined();
    expect(code.diagnostics.some((d) => d.code === 'export.visualNotCertified')).toBe(false);
    for (const id of ['png', 'gif', 'sprite-sheet', 'ascii', 'binary']) {
      const out = runExport(exporter(id), ctx, {});
      expect(out.files?.length).toBeGreaterThan(0);
      expect(out.diagnostics).toContainEqual(
        expect.objectContaining({ severity: 'warning', code: 'export.visualNotCertified' }),
      );
    }
  });

  it('custom-chars anota los códigos ROM usados en cada fila', () => {
    const rowsA = [...a00GlyphRows7(0x41)!, 0];
    const p = makeProject('hd44780-16x2', [
      { pixels: charPixels(16, 2, { '0,0': rowsA, '0,1': HEART }) },
    ]);
    const out = runExport(
      exporter('custom-chars'),
      ctxFor({ ...p, romCharset: 'hd44780-a00' }),
      {},
    );
    const src = new TextDecoder().decode(out.files![0]!.data);
    expect(src).toContain('fila 0: 0x41 0 .');
  });

  it('PNG separa las celdas por omisión solo en pantallas de caracteres', () => {
    const png = exporter('png');
    const graphic = ctxFor(makeProject('ssd1306-128x64', [{ pixels: new Uint8Array(128 * 64) }]));
    const chars = ctxFor(makeProject('hd44780-16x2', [{ pixels: new Uint8Array(80 * 16) }]));
    expect(png.normalize({}, graphic)).toMatchObject({ cellGap: false });
    expect(png.normalize({}, chars)).toMatchObject({ cellGap: true });
  });

  it('avisa cuando la flash está cerca del límite', () => {
    const uno = getArduinoBoard('arduino-uno')!;
    const near = validateAvr(uno, 'none', {
      progmemBytes: 28_000,
      ramDataBytes: 0,
      largestObjectBytes: 1000,
    });
    expect(near.map((d) => [d.severity, d.code])).toContainEqual(['warning', 'avr.flashNearLimit']);
    const over = validateAvr(uno, 'none', {
      progmemBytes: 40_000,
      ramDataBytes: 0,
      largestObjectBytes: 1000,
    });
    expect(over.map((d) => d.code)).toContain('avr.flash');
    expect(over.map((d) => d.code)).not.toContain('avr.flashNearLimit');
  });

  it('hex8 rechaza valores fuera de un byte', () => {
    expect(hex8(0)).toBe('0x00');
    expect(hex8(255)).toBe('0xFF');
    for (const bad of [-1, 256, 1.5, NaN]) expect(() => hex8(bad)).toThrow(/rango/);
  });
});

describe('cabeceras de imagen: casos límite', () => {
  it('JPEG admite bytes de relleno 0xFF entre marcadores', () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xff, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30, 0x00, 0x40, 0x03, 0, 0, 0,
      0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(readImageHeader(jpeg)).toMatchObject({ format: 'jpeg', width: 64, height: 48 });
  });

  it('WebP VP8 sin código de sincronía se considera dañado', () => {
    const b = new Uint8Array(40);
    b.set(new TextEncoder().encode('RIFF'), 0);
    b.set(new TextEncoder().encode('WEBP'), 8);
    b.set(new TextEncoder().encode('VP8 '), 12);
    expect(() => readImageHeader(b)).toThrow(/corrupt/);
    b.set(new TextEncoder().encode('VP8L'), 12);
    expect(() => readImageHeader(b)).toThrow(/corrupt/);
    b.set(new TextEncoder().encode('ABCD'), 12);
    expect(() => readImageHeader(b)).toThrow(/corrupt/);
  });
});
