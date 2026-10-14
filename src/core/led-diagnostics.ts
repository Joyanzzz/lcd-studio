/**
 * Patrones de diagnóstico para matrices de LEDs de 8×8. Se añaden como
 * fotogramas normales (edición deshacible) para exportarlos con la misma
 * orientación y cableado que el proyecto y comprobar en el módulo real:
 *
 * 1. «Orientación»: flecha hacia arriba con un punto en la esquina superior
 *    izquierda. Si se ve girada o reflejada, el giro o el cableado no son los
 *    del módulo.
 * 2. «Esquinas»: 1, 2, 3 y 4 LEDs en las esquinas superior izquierda,
 *    superior derecha, inferior derecha e inferior izquierda.
 * 3. Barrido de filas (8 fotogramas, de arriba abajo).
 * 4. Barrido de columnas (8 fotogramas, de izquierda a derecha).
 * 5. Todos encendidos (brillo y LEDs fundidos).
 */

export interface DiagnosticFrame {
  readonly key: string;
  readonly pixels: Uint8Array;
  readonly durationMs: number;
}

const N = 8;

function frame(points: readonly (readonly [number, number])[]): Uint8Array {
  const p = new Uint8Array(N * N);
  for (const [x, y] of points) p[y * N + x] = 1;
  return p;
}

export function ledDiagnosticFrames(): DiagnosticFrame[] {
  const arrow: [number, number][] = [
    [0, 0],
    [4, 1],
    [3, 2],
    [4, 2],
    [5, 2],
    [2, 3],
    [4, 3],
    [6, 3],
    [4, 4],
    [4, 5],
    [4, 6],
    [4, 7],
  ];
  const corners: [number, number][] = [
    [0, 0],
    [7, 0],
    [6, 0],
    [7, 7],
    [6, 7],
    [5, 7],
    [0, 7],
    [1, 7],
    [2, 7],
    [3, 7],
  ];
  const out: DiagnosticFrame[] = [
    { key: 'orientation', pixels: frame(arrow), durationMs: 2000 },
    { key: 'corners', pixels: frame(corners), durationMs: 2000 },
  ];
  for (let r = 0; r < N; r++) {
    out.push({
      key: `row${r}`,
      pixels: frame(Array.from({ length: N }, (_, x) => [x, r] as const)),
      durationMs: 400,
    });
  }
  for (let c = 0; c < N; c++) {
    out.push({
      key: `col${c}`,
      pixels: frame(Array.from({ length: N }, (_, y) => [c, y] as const)),
      durationMs: 400,
    });
  }
  out.push({ key: 'all', pixels: new Uint8Array(N * N).fill(1), durationMs: 2000 });
  return out;
}
