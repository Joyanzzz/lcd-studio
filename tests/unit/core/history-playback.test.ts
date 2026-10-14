import { describe, expect, it } from 'vitest';
import { History, projectRetainedBytes } from '../../../src/core/history.ts';
import { nextPlaybackStep, playbackCycle, type PlaybackState } from '../../../src/core/playback.ts';
import {
  createProject,
  duplicateFrame,
  replaceFramePixels,
  type Project,
} from '../../../src/core/project.ts';

const sizeCost = (older: number[], newer: number[]) =>
  older.filter((v) => !newer.includes(v)).length;

describe('historial', () => {
  it('deshace y rehace en orden', () => {
    const h = new History<number[]>({ cost: () => 1 });
    let state = [0];
    for (let i = 1; i <= 3; i++) {
      const next = [...state, i];
      h.push(state, next, `paso ${i}`);
      state = next;
    }
    expect(h.depth).toBe(3);
    expect(h.undoLabel).toBe('paso 3');
    state = h.undo(state)!;
    expect(state).toEqual([0, 1, 2]);
    expect(h.redoLabel).toBe('paso 3');
    state = h.undo(state)!;
    state = h.redo(state)!;
    expect(state).toEqual([0, 1, 2]);
    expect(h.canRedo).toBe(true);
    h.push(state, [9], 'nuevo');
    expect(h.canRedo).toBe(false);
    expect(h.redo(state)).toBeUndefined();
    h.clear();
    expect(h.canUndo).toBe(false);
    expect(h.undo(state)).toBeUndefined();
  });

  it('respeta la profundidad máxima', () => {
    const h = new History<number>({ cost: () => 1, maxDepth: 100 });
    for (let i = 0; i < 150; i++) h.push(i, i + 1, 'x');
    expect(h.depth).toBe(100);
    let s = 150;
    let n = 0;
    while (h.canUndo) {
      s = h.undo(s)!;
      n++;
    }
    expect(n).toBe(100);
    expect(s).toBe(50);
  });

  it('respeta el presupuesto de memoria descartando lo más antiguo', () => {
    const h = new History<number[]>({ cost: sizeCost, maxBytes: 10 });
    let state: number[] = [];
    for (let i = 0; i < 20; i++) {
      const next = [i];
      h.push(state, next, 'x');
      state = next;
    }
    expect(h.bytes).toBeLessThanOrEqual(10);
    expect(h.depth).toBeLessThanOrEqual(11);
  });

  it('marca como no deshacible un cambio que excede el presupuesto', () => {
    const h = new History<number>({ cost: () => 50, maxBytes: 10 });
    h.push(1, 2, 'a');
    expect(h.push(2, 3, 'b')).toEqual({ undoable: false, evicted: 0 });
    expect(h.canUndo).toBe(false);
    const nan = new History<number>({ cost: () => NaN });
    expect(nan.push(1, 2, 'a').undoable).toBe(false);
  });

  it('rechaza límites no válidos', () => {
    expect(() => new History<number>({ cost: () => 1, maxBytes: 0 })).toThrow();
    expect(() => new History<number>({ cost: () => 1, maxDepth: 0 })).toThrow();
  });

  it('solo cuenta la memoria que no se comparte', () => {
    let p: Project = createProject({
      name: 'h',
      profileId: 'graphic-custom',
      width: 100,
      height: 100,
    });
    const q = duplicateFrame(p, 0);
    // Duplicar comparte el arreglo: solo la sobrecarga fija.
    expect(projectRetainedBytes(p, q)).toBeLessThan(1000);
    // En q ambos fotogramas comparten el arreglo; al editar uno, el otro lo sigue usando.
    p = replaceFramePixels(q, 0, new Uint8Array(10_000));
    expect(projectRetainedBytes(q, p)).toBeLessThan(1000);
    const r = replaceFramePixels(p, 1, new Uint8Array(10_000));
    expect(projectRetainedBytes(p, r)).toBeGreaterThanOrEqual(10_000);
  });

  it('mantiene un proyecto 512×512 × 240 dentro de 128 MB tras muchas ediciones', () => {
    let p = createProject({ name: 'big', profileId: 'graphic-custom', width: 512, height: 512 });
    const h = new History<Project>({ cost: projectRetainedBytes });
    for (let i = 0; i < 300; i++) {
      const next = replaceFramePixels(p, 0, new Uint8Array(512 * 512));
      h.push(p, next, 'edición');
      p = next;
    }
    expect(h.bytes).toBeLessThanOrEqual(128 * 1024 * 1024);
    expect(h.depth).toBeLessThanOrEqual(100);
  });
});

describe('reproducción', () => {
  it('genera el ciclo de cada modo', () => {
    expect(playbackCycle(4, 'loop')).toEqual([0, 1, 2, 3]);
    expect(playbackCycle(4, 'once')).toEqual([0, 1, 2, 3]);
    expect(playbackCycle(4, 'pingpong')).toEqual([0, 1, 2, 3, 2, 1]);
    expect(playbackCycle(2, 'pingpong')).toEqual([0, 1]);
    expect(playbackCycle(1, 'pingpong')).toEqual([0]);
    expect(playbackCycle(0, 'loop')).toEqual([]);
    expect(playbackCycle(NaN, 'loop')).toEqual([]);
  });

  const run = (n: number, mode: 'loop' | 'once' | 'pingpong', steps: number) => {
    let s: PlaybackState = { index: 0, direction: 1 };
    const out = [0];
    for (let i = 0; i < steps; i++) {
      const next = nextPlaybackStep(s, n, mode);
      out.push(next.index);
      if (next.finished) break;
      s = next;
    }
    return out;
  };

  it('avanza paso a paso igual que el ciclo', () => {
    expect(run(3, 'loop', 6)).toEqual([0, 1, 2, 0, 1, 2, 0]);
    expect(run(4, 'pingpong', 8)).toEqual([0, 1, 2, 3, 2, 1, 0, 1, 2]);
    expect(run(3, 'once', 10)).toEqual([0, 1, 2, 2]);
    expect(run(1, 'loop', 3)).toEqual([0, 0]);
  });

  it('acota índices fuera de rango', () => {
    expect(nextPlaybackStep({ index: 99, direction: 1 }, 3, 'loop').index).toBe(0);
    expect(nextPlaybackStep({ index: -5, direction: -1 }, 3, 'pingpong')).toEqual({
      index: 1,
      direction: 1,
      finished: false,
    });
  });
});
