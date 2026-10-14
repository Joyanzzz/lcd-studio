/** Utilidades para describir mapas de bits como texto en las pruebas. */

export function fromAscii(rows: string[]): { width: number; height: number; pixels: Uint8Array } {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const pixels = new Uint8Array(width * height);
  rows.forEach((row, y) => {
    if (row.length !== width) throw new Error('Filas de distinta longitud');
    for (let x = 0; x < width; x++) pixels[y * width + x] = row[x] === '#' ? 1 : 0;
  });
  return { width, height, pixels };
}

export function toAscii(pixels: Uint8Array, width: number, height: number): string[] {
  const rows: string[] = [];
  for (let y = 0; y < height; y++) {
    let s = '';
    for (let x = 0; x < width; x++) s += pixels[y * width + x] ? '#' : '.';
    rows.push(s);
  }
  return rows;
}

/** Patrones dorados reutilizados por los exportadores. */
export interface GoldenPatterns {
  empty: Uint8Array;
  full: Uint8Array;
  isolated: Uint8Array;
  checker: Uint8Array;
  diagonal: Uint8Array;
  border: Uint8Array;
}

export function goldenPatterns(width: number, height: number): GoldenPatterns {
  const n = width * height;
  const isolated = new Uint8Array(n);
  isolated[Math.floor(height / 2) * width + Math.floor(width / 2)] = 1;
  const checker = new Uint8Array(n);
  const diagonal = new Uint8Array(n);
  const border = new Uint8Array(n);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      checker[i] = (x + y) % 2 === 0 ? 1 : 0;
      diagonal[i] = x === y || x === width - 1 - y ? 1 : 0;
      border[i] = x === 0 || y === 0 || x === width - 1 || y === height - 1 ? 1 : 0;
    }
  }
  return {
    empty: new Uint8Array(n),
    full: new Uint8Array(n).fill(1),
    isolated,
    checker,
    diagonal,
    border,
  };
}
