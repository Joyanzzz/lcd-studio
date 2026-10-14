import { LIMITS } from './limits.ts';

/**
 * Historial de deshacer/rehacer con presupuesto de memoria.
 *
 * Los estados son inmutables y comparten estructura. El coste de conservar un
 * estado es la memoria que solo él retiene: la que no comparte con su vecino
 * más reciente. Lo calcula la función `cost` que recibe el historial.
 */

export interface HistoryEntry<S> {
  readonly state: S;
  readonly label: string;
  readonly cost: number;
}

export interface HistoryOptions<S> {
  /** Bytes que `older` retiene y `newer` no comparte. */
  readonly cost: (older: S, newer: S) => number;
  readonly maxBytes?: number;
  readonly maxDepth?: number;
}

export interface PushResult {
  /** Falso si el cambio superaba el presupuesto por sí solo y no se puede deshacer. */
  readonly undoable: boolean;
  /** Entradas antiguas descartadas para respetar los límites. */
  readonly evicted: number;
}

export class History<S> {
  private undoStack: HistoryEntry<S>[] = [];
  private redoStack: HistoryEntry<S>[] = [];
  private readonly costFn: (older: S, newer: S) => number;
  private readonly maxBytes: number;
  private readonly maxDepth: number;

  constructor(options: HistoryOptions<S>) {
    this.costFn = options.cost;
    this.maxBytes = options.maxBytes ?? LIMITS.historyMaxBytes;
    this.maxDepth = options.maxDepth ?? LIMITS.historyMaxDepth;
    if (!(this.maxBytes > 0) || !Number.isInteger(this.maxDepth) || this.maxDepth < 1) {
      throw new Error('Límites de historial no válidos');
    }
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  get depth(): number {
    return this.undoStack.length;
  }

  get redoDepth(): number {
    return this.redoStack.length;
  }

  /** Memoria total estimada retenida por el historial. */
  get bytes(): number {
    let sum = 0;
    for (const e of this.undoStack) sum += e.cost;
    for (const e of this.redoStack) sum += e.cost;
    return sum;
  }

  get undoLabel(): string | undefined {
    return this.undoStack.at(-1)?.label;
  }

  get redoLabel(): string | undefined {
    return this.redoStack.at(-1)?.label;
  }

  /** Registra que `previous` pasó a `next`. Vacía la pila de rehacer. */
  push(previous: S, next: S, label: string): PushResult {
    this.redoStack = [];
    const cost = Math.max(0, this.costFn(previous, next));
    if (!Number.isFinite(cost) || cost > this.maxBytes) {
      const evicted = this.undoStack.length;
      this.undoStack = [];
      return { undoable: false, evicted };
    }
    this.undoStack.push({ state: previous, label, cost });
    return { undoable: true, evicted: this.enforce() };
  }

  /** Devuelve el estado anterior; `current` pasa a la pila de rehacer. */
  undo(current: S): S | undefined {
    const entry = this.undoStack.pop();
    if (!entry) return undefined;
    this.redoStack.push({
      state: current,
      label: entry.label,
      cost: Math.max(0, this.costFn(current, entry.state)),
    });
    this.enforce();
    return entry.state;
  }

  redo(current: S): S | undefined {
    const entry = this.redoStack.pop();
    if (!entry) return undefined;
    this.undoStack.push({
      state: current,
      label: entry.label,
      cost: Math.max(0, this.costFn(current, entry.state)),
    });
    this.enforce();
    return entry.state;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
  }

  private enforce(): number {
    let evicted = 0;
    while (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
      evicted++;
    }
    while (this.bytes > this.maxBytes && this.undoStack.length > 0) {
      this.undoStack.shift();
      evicted++;
    }
    while (this.bytes > this.maxBytes && this.redoStack.length > 0) {
      this.redoStack.shift();
      evicted++;
    }
    return evicted;
  }
}

/**
 * Coste de retener un proyecto anterior: bytes de los arreglos de píxeles que
 * `older` tiene y `newer` no comparte, más una pequeña sobrecarga fija.
 */
export function projectRetainedBytes(
  older: { readonly frames: readonly { readonly pixels: Uint8Array }[] },
  newer: { readonly frames: readonly { readonly pixels: Uint8Array }[] },
): number {
  const shared = new Set<Uint8Array>();
  for (const f of newer.frames) shared.add(f.pixels);
  let bytes = 256;
  for (const f of older.frames) {
    bytes += 48;
    if (!shared.has(f.pixels)) bytes += f.pixels.byteLength;
  }
  return bytes;
}
