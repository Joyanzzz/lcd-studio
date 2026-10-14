import { describe, expect, it } from 'vitest';
import { DrawSurface } from '../../../src/engine/draw.ts';
import { floodFill } from '../../../src/engine/fill.ts';
import { constrainEnd, plotEllipse, plotLine, plotRect } from '../../../src/engine/geometry.ts';
import { fromAscii, toAscii } from '../../helpers/bitmap.ts';

function render(width: number, height: number, draw: (s: DrawSurface) => void): string[] {
  const s = new DrawSurface(width, height, new Uint8Array(width * height));
  draw(s);
  return toAscii(s.pixels, width, height);
}

describe('línea', () => {
  it('dibuja horizontales, verticales y diagonales con ambos extremos', () => {
    expect(render(5, 3, (s) => s.line(0, 1, 4, 1, 1))).toEqual(['.....', '#####', '.....']);
    expect(render(3, 3, (s) => s.line(1, 2, 1, 0, 1))).toEqual(['.#.', '.#.', '.#.']);
    expect(render(4, 4, (s) => s.line(3, 3, 0, 0, 1))).toEqual(['#...', '.#..', '..#.', '...#']);
  });

  it('es simétrica al invertir los extremos y conecta sin huecos', () => {
    const a: string[] = [];
    const b: string[] = [];
    plotLine(0, 0, 7, 3, (x, y) => a.push(`${x},${y}`));
    plotLine(7, 3, 0, 0, (x, y) => b.push(`${x},${y}`));
    expect(new Set(a)).toEqual(new Set(b));
    expect(a).toHaveLength(8);
  });

  it('dibuja un punto cuando los extremos coinciden', () => {
    const pts: number[][] = [];
    plotLine(2, 2, 2, 2, (x, y) => pts.push([x, y]));
    expect(pts).toEqual([[2, 2]]);
  });
});

describe('rectángulo', () => {
  it('contorno y relleno', () => {
    expect(render(5, 4, (s) => s.rect(0, 0, 4, 3, false, 1))).toEqual([
      '#####',
      '#...#',
      '#...#',
      '#####',
    ]);
    expect(render(4, 3, (s) => s.rect(3, 2, 1, 0, true, 1))).toEqual(['.###', '.###', '.###']);
  });

  it('degenerado de una columna no duplica píxeles', () => {
    const pts: string[] = [];
    plotRect(1, 0, 1, 2, false, (x, y) => pts.push(`${x},${y}`));
    expect(pts).toEqual(['1,0', '1,1', '1,2']);
  });
});

describe('elipse', () => {
  it('contorno simétrico dentro del rectángulo', () => {
    const out = render(9, 7, (s) => s.ellipse(0, 0, 8, 6, false, 1));
    expect(out).toEqual([
      '..#####..',
      '.#.....#.',
      '#.......#',
      '#.......#',
      '#.......#',
      '.#.....#.',
      '..#####..',
    ]);
  });

  it('relleno cubre el interior', () => {
    const out = render(7, 5, (s) => s.ellipse(0, 0, 6, 4, true, 1));
    expect(out).toEqual(['..###..', '.#####.', '#######', '.#####.', '..###..']);
  });

  it.each([
    [0, 0, 0, 0],
    [0, 0, 0, 5],
    [0, 0, 5, 0],
    [0, 0, 1, 6],
    [0, 0, 6, 1],
    [2, 1, 9, 12],
    [9, 12, 2, 1],
  ])('casos degenerados y planos (%i,%i)-(%i,%i) quedan en la caja', (x0, y0, x1, y1) => {
    const pts = new Set<string>();
    const rows = new Set<number>();
    plotEllipse(x0, y0, x1, y1, false, (x, y) => {
      expect(x).toBeGreaterThanOrEqual(Math.min(x0, x1));
      expect(x).toBeLessThanOrEqual(Math.max(x0, x1));
      expect(y).toBeGreaterThanOrEqual(Math.min(y0, y1));
      expect(y).toBeLessThanOrEqual(Math.max(y0, y1));
      const key = `${x},${y}`;
      expect(pts.has(key)).toBe(false);
      pts.add(key);
      rows.add(y);
    });
    // Cubre todas las filas de la caja.
    expect(rows.size).toBe(Math.abs(y1 - y0) + 1);
  });
});

describe('restricción con Mayús', () => {
  it('ajusta líneas a 0°, 45° y 90°', () => {
    expect(constrainEnd({ x: 0, y: 0 }, { x: 10, y: 2 }, 'line')).toEqual({ x: 10, y: 0 });
    expect(constrainEnd({ x: 0, y: 0 }, { x: 1, y: -9 }, 'line')).toEqual({ x: 0, y: -9 });
    expect(constrainEnd({ x: 0, y: 0 }, { x: 5, y: -4 }, 'line')).toEqual({ x: 5, y: -5 });
  });

  it('ajusta cajas a 1:1', () => {
    expect(constrainEnd({ x: 2, y: 2 }, { x: 5, y: 0 }, 'box')).toEqual({ x: 5, y: -1 });
    expect(constrainEnd({ x: 2, y: 2 }, { x: 2, y: 2 }, 'box')).toEqual({ x: 2, y: 2 });
  });
});

describe('superficie de dibujo', () => {
  it('aplica simetría y recorta fuera de los límites', () => {
    const s = new DrawSurface(5, 3, new Uint8Array(15), { horizontal: true, vertical: true });
    s.plot(0, 0, 1);
    s.plot(-1, 5, 1);
    expect(toAscii(s.pixels, 5, 3)).toEqual(['#...#', '.....', '#...#']);
    expect(s.dirty).toEqual({ x0: 0, y0: 0, x1: 4, y1: 2 });
  });

  it('restaura desde una base para la vista previa de formas', () => {
    const s = new DrawSurface(3, 1, new Uint8Array(3));
    s.plot(1, 0, 1);
    s.restore(Uint8Array.from([1, 0, 0]));
    expect(Array.from(s.pixels)).toEqual([1, 0, 0]);
    expect(() => new DrawSurface(3, 3, new Uint8Array(2))).toThrow();
  });
});

describe('relleno por área', () => {
  it('rellena una región cerrada sin escapar por diagonales', () => {
    const { width, height, pixels } = fromAscii(['#####', '#...#', '#.#.#', '#...#', '####.']);
    const changed = floodFill(pixels, width, height, 1, 1, 1);
    expect(changed).toBe(8);
    expect(toAscii(pixels, width, height)).toEqual(['#####', '#####', '#####', '#####', '####.']);
  });

  it('borra con valor 0 y no hace nada fuera del lienzo o con el mismo valor', () => {
    const { width, height, pixels } = fromAscii(['##', '##']);
    expect(floodFill(pixels, width, height, 5, 0, 0)).toBe(0);
    expect(floodFill(pixels, width, height, 0, 0, 1)).toBe(0);
    expect(floodFill(pixels, width, height, 0, 0, 0)).toBe(4);
  });

  it('rellena un lienzo 512×512 vacío sin desbordar la pila', () => {
    const px = new Uint8Array(512 * 512);
    expect(floodFill(px, 512, 512, 100, 100, 1)).toBe(512 * 512);
  });

  it('rellena un laberinto en espiral', () => {
    const { width, height, pixels } = fromAscii([
      '.........',
      '########.',
      '.......#.',
      '.#####.#.',
      '.#...#.#.',
      '.#.###.#.',
      '.#.....#.',
      '.#######.',
      '.........',
    ]);
    floodFill(pixels, width, height, 0, 0, 1);
    expect(toAscii(pixels, width, height).every((r) => !r.includes('.') || r.includes('#'))).toBe(
      true,
    );
    expect(pixels[4 * width + 2]).toBe(1);
  });
});
