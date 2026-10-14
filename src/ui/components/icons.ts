/**
 * Iconos pixel-art de 16×16 al estilo Windows 2000. Se definen como filas de
 * caracteres (un color por letra) o como funciones de dibujo y se convierten
 * una sola vez en trazados SVG agrupados por color. Los colores se resuelven
 * con variables CSS, así que cambian con el tema claro/oscuro.
 *
 * Colores: k contorno, w blanco, l gris claro, g gris, b azul, B azul claro,
 * y amarillo, Y amarillo claro, r rojo, G verde, p rosa, n madera, D verde LCD
 * oscuro, L verde LCD claro.
 */

type Plot = (x: number, y: number, color: string) => void;
type IconDef = readonly string[] | ((plot: Plot) => void);

const box = (
  P: Plot,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  outline: string,
  fill?: string,
) => {
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const edge = x === x0 || x === x1 || y === y0 || y === y1;
      if (edge) P(x, y, outline);
      else if (fill) P(x, y, fill);
    }
  }
};

const arrow = (P: Plot, dir: 'left' | 'right' | 'up' | 'down', c = 'k') => {
  for (let i = 0; i < 4; i++) {
    for (let j = -i; j <= i; j++) {
      if (dir === 'up') P(8 + j, 5 + i, c);
      if (dir === 'down') P(8 + j, 10 - i, c);
      if (dir === 'left') P(5 + i, 8 + j, c);
      if (dir === 'right') P(10 - i, 8 + j, c);
    }
  }
};

const ring = (P: Plot, cx: number, cy: number, r: number, c: string, fill?: string) => {
  for (let y = 0; y < 16; y++) {
    for (let x = 0; x < 16; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (Math.abs(d - r) < 0.6) P(x, y, c);
      else if (fill && d < r - 0.5) P(x, y, fill);
    }
  }
};

const DEFS: Record<string, IconDef> = {
  select: (P) => {
    for (let x = 2; x <= 13; x++) {
      const c = (x >> 1) & 1 ? 'k' : 'l';
      P(x, 3, c);
      P(x, 12, c);
    }
    for (let y = 3; y <= 12; y++) {
      const c = (y >> 1) & 1 ? 'k' : 'l';
      P(2, y, c);
      P(13, y, c);
    }
  },
  pencil: [
    '............kk..',
    '...........krrk.',
    '..........krrrk.',
    '.........kYkrk..',
    '........kYyyk...',
    '.......kYyyk....',
    '......kYyyk.....',
    '.....kYyyk......',
    '....kYyyk.......',
    '...kYyyk........',
    '...knyk.........',
    '..knnk..........',
    '..kkk...........',
    '................',
  ],
  eraser: [
    '................',
    '................',
    '................',
    '......kkkkkkkkk.',
    '.....kwwwwwwwwkk',
    '....kwwwwwwwwkpk',
    '...kkkkkkkkkkppk',
    '...kppppppppkppk',
    '...kppppppppkpk.',
    '...kppppppppkk..',
    '...kkkkkkkkkk...',
  ],
  fill: [
    '................',
    '.....kk.........',
    '....k..k........',
    '....k.kkkk......',
    '...kkwwwwwk.....',
    '..kwwwwwwwwkb...',
    '.kwwwwwwwwwwkbb.',
    'kwwwwwwwwwwwkbbb',
    '.kwwwwwwwwwkkbbb',
    '..kwwwwwwwk..bbb',
    '...kwwwwwk...bb.',
    '....kwwwk....b..',
    '.....kwk........',
    '......k.........',
  ],
  line: (P) => {
    for (let i = 2; i <= 13; i++) P(i, 15 - i, 'k');
  },
  rect: (P) => box(P, 2, 3, 13, 12, 'k'),
  ellipse: (P) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot((x - 7.5) / 1.0, (y - 7.5) / 0.8);
        if (Math.abs(d - 5.8) < 0.62) P(x, y, 'k');
      }
    }
  },
  text: [
    '................',
    '................',
    '..kkkkkkkkkkkk..',
    '..kk...kk...kk..',
    '..k....kk....k..',
    '.......kk.......',
    '.......kk.......',
    '.......kk.......',
    '.......kk.......',
    '.......kk.......',
    '.......kk.......',
    '.......kk.......',
    '.....kkkkkk.....',
  ],
  new: [
    '................',
    '...kkkkkkk......',
    '...kwwwwwkk.....',
    '...kwwwwwkwk....',
    '...kwwwwwkkkk...',
    '...kwwwwwwwwk...',
    '...kwwwwwwwwk...',
    '...kwwwwwwwwk...',
    '...kwwwwwwwwk...',
    '...kwwwwwwwwk...',
    '...kwwwwwwwwk...',
    '...kwwwwwwwwk...',
    '...kwwwwwwwwk...',
    '...kwwwwwwwwk...',
    '...kkkkkkkkkk...',
  ],
  open: [
    '................',
    '................',
    '................',
    '.kkkk...........',
    'kyyyyk..........',
    'kyyyyykkkkkkkk..',
    'kyyyyyyyyyyyyk..',
    'kyyykkkkkkkkkkkk',
    'kyykYYYYYYYYYYk.',
    'kyykYYYYYYYYYk..',
    'kykYYYYYYYYYYk..',
    'kykYYYYYYYYYk...',
    'kkYYYYYYYYYYk...',
    'kkkkkkkkkkkkk...',
  ],
  save: [
    'kkkkkkkkkkkkkkk.',
    'kbwwwwwwwwwwwbk.',
    'kbwwwwwwwwwwwbk.',
    'kbwgggggggggwbk.',
    'kbwwwwwwwwwwwbk.',
    'kbwgggggggggwbk.',
    'kbwwwwwwwwwwwbk.',
    'kbbbbbbbbbbbbbk.',
    'kbbbbbbbbbbbbbk.',
    'kbbllllllllbbbk.',
    'kbbllkkllllbbbk.',
    'kbbllkkllllbbbk.',
    'kbbllkkllllbbbk.',
    'kbbllllllllbbbk.',
    'kkkkkkkkkkkkkkk.',
  ],
  saveAs: (P) => {
    box(P, 0, 0, 12, 12, 'k', 'b');
    box(P, 2, 1, 10, 5, 'k', 'w');
    box(P, 3, 8, 9, 12, 'k', 'l');
    for (let i = 0; i < 5; i++) P(10 + i - 1, 15 - i, 'r');
    P(14, 10, 'k');
  },
  undo: (P) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const d = Math.hypot(x - 8, y - 9);
        if (y <= 9 && d > 3.5 && d < 5.6 && x >= 7) P(x, y, 'b');
      }
    }
    for (let i = 0; i < 4; i++) for (let j = -i; j <= i; j++) P(4 + j, 6 + i, 'b');
    P(13, 10, 'b');
    P(12, 11, 'b');
    P(13, 9, 'b');
  },
  redo: (P) => DEFS_FN('undo')((x, y, c) => P(15 - x, y, c)),
  help: (P) => {
    ring(P, 7.5, 7.5, 6.7, 'k', 'b');
    [
      '..www..',
      '.w...w.',
      '.....w.',
      '....w..',
      '...w...',
      '...w...',
      '.......',
      '...w...',
    ].forEach((row, y) => [...row].forEach((c, x) => c === 'w' && P(x + 4, y + 4, 'w')));
  },
  settings: (P) => {
    ring(P, 7.5, 7.5, 5, 'k', 'l');
    ring(P, 7.5, 7.5, 2, 'k', 'w');
    for (const [x, y] of [
      [7, 0],
      [8, 0],
      [7, 15],
      [8, 15],
      [0, 7],
      [0, 8],
      [15, 7],
      [15, 8],
      [2, 2],
      [13, 2],
      [2, 13],
      [13, 13],
    ] as const) {
      P(x, y, 'k');
    }
  },
  play: (P) => {
    for (let y = 2; y <= 13; y++) {
      const h = Math.min(y - 2, 13 - y);
      for (let x = 4; x <= 4 + 2 * h; x++)
        P(x, y, x === 4 || x === 4 + 2 * h || y === 2 || y === 13 ? 'k' : 'G');
    }
  },
  stop: (P) => box(P, 3, 3, 12, 12, 'k', 'r'),
  duplicate: (P) => {
    box(P, 6, 1, 14, 11, 'k', 'w');
    box(P, 1, 4, 9, 14, 'k', 'w');
    for (let y = 7; y <= 12; y += 2) for (let x = 3; x <= 7; x++) P(x, y, 'g');
  },
  delete: [
    '................',
    '......kkkk......',
    '..kkkkkkkkkkkk..',
    '..kllllllllllk..',
    '..kkkkkkkkkkkk..',
    '...klglglglgk...',
    '...klglglglgk...',
    '...klglglglgk...',
    '...klglglglgk...',
    '...klglglglgk...',
    '...klglglglgk...',
    '...klglglglgk...',
    '...klglglglgk...',
    '...klglglglgk...',
    '...kkkkkkkkkk...',
  ],
  left: (P) => arrow(P, 'left'),
  right: (P) => arrow(P, 'right'),
  up: (P) => arrow(P, 'up'),
  down: (P) => arrow(P, 'down'),
  zoomIn: (P) => {
    ring(P, 6, 6, 4.6, 'k', 'B');
    for (let i = 0; i < 5; i++) {
      P(10 + i, 10 + i, 'n');
      P(11 + i, 10 + i, 'k');
    }
    for (let i = 4; i <= 8; i++) {
      P(i, 6, 'k');
      P(6, i, 'k');
    }
  },
  zoomOut: (P) => {
    ring(P, 6, 6, 4.6, 'k', 'B');
    for (let i = 0; i < 5; i++) {
      P(10 + i, 10 + i, 'n');
      P(11 + i, 10 + i, 'k');
    }
    for (let i = 4; i <= 8; i++) P(i, 6, 'k');
  },
  fit: (P) => {
    box(P, 1, 1, 14, 14, 'g');
    arrow(P, 'left');
    arrow(P, 'right');
  },
  onion: (P) => {
    box(P, 1, 1, 9, 9, 'r');
    box(P, 6, 6, 14, 14, 'G');
    box(P, 3, 3, 11, 11, 'k', 'w');
  },
  lcd: (P) => {
    box(P, 0, 3, 15, 12, 'k', 'g');
    box(P, 2, 5, 13, 10, 'D', 'L');
    for (const [x, y] of [
      [4, 7],
      [5, 7],
      [6, 7],
      [8, 7],
      [9, 7],
      [10, 7],
      [4, 8],
      [8, 8],
    ] as const)
      P(x, y, 'D');
  },
  image: (P) => {
    box(P, 1, 2, 14, 13, 'k', 'B');
    for (let x = 2; x <= 13; x++) for (let y = 9; y <= 12; y++) P(x, y, 'G');
    ring(P, 10.5, 5.5, 1.6, 'y', 'y');
  },
  export: (P) => {
    box(P, 1, 5, 10, 14, 'k', 'w');
    for (let i = 0; i < 6; i++) P(8 + i, 7 - i, 'b');
    for (let i = 10; i <= 14; i++) P(i, 1, 'b');
    for (let i = 1; i <= 5; i++) P(14, i, 'b');
  },
  moon: (P) => {
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        if (Math.hypot(x - 7.5, y - 7.5) < 6 && Math.hypot(x - 10.5, y - 5) > 4.5) P(x, y, 'y');
      }
    }
  },
  sun: (P) => {
    ring(P, 7.5, 7.5, 3.5, 'k', 'y');
    for (const [x, y] of [
      [7, 0],
      [8, 0],
      [7, 15],
      [8, 15],
      [0, 7],
      [0, 8],
      [15, 7],
      [15, 8],
      [2, 2],
      [13, 2],
      [2, 13],
      [13, 13],
    ] as const) {
      P(x, y, 'y');
    }
  },
  globe: (P) => {
    ring(P, 7.5, 7.5, 6.5, 'k', 'B');
    for (let y = 2; y <= 13; y++) P(7, y, 'b');
    for (let x = 2; x <= 13; x++) P(x, 7, 'b');
    for (let y = 3; y <= 12; y++) {
      P(4, y, 'b');
      P(11, y, 'b');
    }
  },
  close: (P) => {
    for (let i = 4; i <= 11; i++) {
      P(i, i, 'k');
      P(i + 1, i, 'k');
      P(15 - i, i, 'k');
      P(16 - i, i, 'k');
    }
  },
  error: (P) => {
    ring(P, 7.5, 7.5, 6.5, 'k', 'r');
    for (let i = 5; i <= 10; i++) {
      P(i, i, 'w');
      P(15 - i, i, 'w');
    }
  },
  warning: (P) => {
    for (let y = 1; y <= 14; y++) {
      const half = Math.floor((y - 1) / 2);
      for (let x = 7 - half; x <= 8 + half; x++)
        P(x, y, x === 7 - half || x === 8 + half || y === 14 ? 'k' : 'y');
    }
    for (let y = 5; y <= 10; y++) P(7, y, 'k');
    for (let y = 5; y <= 10; y++) P(8, y, 'k');
    P(7, 12, 'k');
    P(8, 12, 'k');
  },
  info: (P) => {
    ring(P, 7.5, 7.5, 6.5, 'k', 'b');
    for (let y = 7; y <= 12; y++) {
      P(7, y, 'w');
      P(8, y, 'w');
    }
    P(7, 4, 'w');
    P(8, 4, 'w');
  },
  check: (P) => {
    const pts = [
      [3, 8],
      [4, 9],
      [5, 10],
      [6, 11],
      [7, 10],
      [8, 9],
      [9, 8],
      [10, 7],
      [11, 6],
      [12, 5],
    ] as const;
    for (const [x, y] of pts) {
      P(x, y, 'G');
      P(x, y + 1, 'G');
    }
  },
  flipH: (P) => {
    for (let y = 2; y <= 13; y++) P(7, y, 'g');
    for (let i = 0; i < 5; i++) for (let y = 8 - i; y <= 8 + i; y++) P(1 + i, y, 'k');
    for (let i = 0; i < 5; i++)
      for (let y = 8 - i; y <= 8 + i; y++)
        if (y === 8 - i || y === 8 + i || i === 4) P(14 - i, y, 'k');
  },
  flipV: (P) => DEFS_FN('flipH')((x, y, c) => P(y, x, c)),
  invert: (P) => {
    box(P, 1, 1, 14, 14, 'k');
    for (let y = 2; y <= 13; y++) for (let x = 2; x <= 13; x++) if (x + y < 16) P(x, y, 'k');
  },
  clear: (P) => box(P, 2, 2, 13, 13, 'k', 'w'),
};

function DEFS_FN(name: string): (plot: Plot) => void {
  const def = DEFS[name];
  if (!def) throw new Error(`Icono desconocido: ${name}`);
  return typeof def === 'function'
    ? def
    : (P) => def.forEach((row, y) => [...row].forEach((c, x) => c !== '.' && P(x, y, c)));
}

export type IconName = keyof typeof DEFS;

/** Trazados SVG por color, calculados una vez. */
const CACHE = new Map<string, readonly { color: string; d: string }[]>();

export function iconPaths(name: string): readonly { color: string; d: string }[] {
  const cached = CACHE.get(name);
  if (cached) return cached;
  const grid = new Map<string, Set<number>>();
  DEFS_FN(name)((x, y, c) => {
    if (x < 0 || y < 0 || x > 15 || y > 15) return;
    let set = grid.get(c);
    if (!set) grid.set(c, (set = new Set()));
    set.add(y * 16 + x);
  });
  const result = [...grid.entries()].map(([color, cells]) => {
    let d = '';
    for (let y = 0; y < 16; y++) {
      let x = 0;
      while (x < 16) {
        if (!cells.has(y * 16 + x)) {
          x++;
          continue;
        }
        const start = x;
        while (x < 16 && cells.has(y * 16 + x)) x++;
        d += `M${start} ${y}h${x - start}v1h${start - x}z`;
      }
    }
    return { color, d };
  });
  CACHE.set(name, result);
  return result;
}
