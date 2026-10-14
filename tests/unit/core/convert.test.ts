import { describe, expect, it } from 'vitest';
import { convertPixels, convertProject } from '../../../src/core/convert.ts';
import { createProject, setDevice, setRomCharset } from '../../../src/core/project.ts';
import { toAscii } from '../../helpers/bitmap.ts';
import { charPixels, makeProject } from '../../helpers/projects.ts';

const dot = (i: number): number[] => {
  const rows = new Array<number>(8).fill(0);
  rows[Math.floor(i / 5)] = 0x10 >> (i % 5);
  return rows;
};

describe('conversión de pantalla', () => {
  it('recorte anclado arriba a la izquierda o centrado y escalado por vecino más próximo', () => {
    const px = Uint8Array.from([1, 0, 0, 1]); // 2×2 diagonal
    expect(toAscii(convertPixels(px, 2, 2, 4, 4, 'crop-top-left'), 4, 4)).toEqual([
      '#...',
      '.#..',
      '....',
      '....',
    ]);
    expect(toAscii(convertPixels(px, 2, 2, 4, 4, 'crop-center'), 4, 4)).toEqual([
      '....',
      '.#..',
      '..#.',
      '....',
    ]);
    expect(toAscii(convertPixels(px, 2, 2, 4, 4, 'scale'), 4, 4)).toEqual([
      '##..',
      '##..',
      '..##',
      '..##',
    ]);
    expect(convertPixels(px, 2, 2, 2, 2, 'scale')).toBe(px);
  });

  it('informa de los píxeles encendidos que se recortan', () => {
    const p = makeProject('graphic-custom', [{ pixels: new Uint8Array(16).fill(1) }], {
      width: 4,
      height: 4,
    });
    const { report, project } = convertProject(
      p,
      'graphic-custom',
      { width: 2, height: 2 },
      'crop-top-left',
    );
    expect(report).toMatchObject({ lostLitPixels: 12, sizeChanged: true, familyChanged: false });
    expect(project.frames[0]!.id).toBe(p.frames[0]!.id);
    expect(
      convertProject(p, 'graphic-custom', { width: 2, height: 2 }, 'scale').report,
    ).toMatchObject({ lostLitPixels: 0 });
  });

  it('hacia caracteres: avisa de los fotogramas por encima del límite sin ajustarlos', () => {
    const p = makeProject('graphic-custom', [{ pixels: new Uint8Array(80 * 16) }], {
      width: 80,
      height: 16,
    });
    const busy = charPixels(
      16,
      2,
      Object.fromEntries(Array.from({ length: 10 }, (_, i) => [`0,${i}`, dot(i)])),
    );
    const withBusy = makeProject('graphic-custom', [{ pixels: busy }], { width: 80, height: 16 });
    const r = convertProject(withBusy, 'hd44780-16x2', undefined, 'crop-top-left');
    expect(r.report.overLimitFrames).toEqual([0]);
    expect(r.report.familyChanged).toBe(true);
    expect(r.report.appearanceChanged).toBe(true);
    expect(r.project.frames[0]!.pixels).toEqual(busy);
    expect(convertProject(p, 'hd44780-16x2', undefined, 'scale').report.overLimitFrames).toEqual(
      [],
    );
  });

  it('desde caracteres: la ROM y la conexión que no aplican quedan sin configurar', () => {
    let p = createProject({ name: 'c', profileId: 'hd44780-16x2' });
    p = setRomCharset(p, 'hd44780-a00');
    p = setDevice(p, {
      connection: 'hd44780-4bit',
      codeTarget: 'arduino-liquidcrystal',
      matrix: null,
    });
    const same = convertProject(p, 'hd44780-20x4', undefined, 'crop-top-left');
    expect(same.project.device).toEqual(p.device);
    expect(same.report).toMatchObject({ romReset: false, connectionReset: false });
    const g = convertProject(p, 'ssd1306-128x64', undefined, 'crop-top-left');
    expect(g.project.romCharset).toBe('none');
    expect(g.project.device).toEqual({ connection: null, codeTarget: null, matrix: null });
    expect(g.report).toMatchObject({ romReset: true, connectionReset: true, targetReset: true });
  });

  it('hacia la matriz de LEDs crea la configuración física predeterminada', () => {
    const p = createProject({ name: 'c', profileId: 'ssd1306-128x32' });
    const m = convertProject(p, 'max7219-8x8', undefined, 'scale').project;
    expect([m.width, m.height]).toEqual([8, 8]);
    expect(m.device.matrix).toEqual({ rotation: 0, wiring: 'rows-msb-left', brightness: 4 });
    expect(m.appearance).toEqual({ palette: 'led-red' });
  });
});
