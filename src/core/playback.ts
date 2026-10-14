import type { LoopMode } from './project.ts';

/**
 * Orden de reproducción. Lo usan el reproductor del editor, el exportador GIF
 * y los generadores de código, de modo que todos animan igual.
 */

/** Una pasada completa de la animación (índices de fotograma). */
export function playbackCycle(frameCount: number, mode: LoopMode): number[] {
  if (!Number.isInteger(frameCount) || frameCount < 1) return [];
  const forward = Array.from({ length: frameCount }, (_, i) => i);
  if (mode !== 'pingpong' || frameCount <= 2) return forward;
  const back: number[] = [];
  for (let i = frameCount - 2; i >= 1; i--) back.push(i);
  return [...forward, ...back];
}

export interface PlaybackState {
  readonly index: number;
  /** 1 hacia delante, -1 hacia atrás (solo en ida y vuelta). */
  readonly direction: 1 | -1;
}

export interface PlaybackStep extends PlaybackState {
  /** Verdadero cuando el modo "una vez" llegó al último fotograma. */
  readonly finished: boolean;
}

/** Siguiente fotograma a mostrar después de `state`. */
export function nextPlaybackStep(
  state: PlaybackState,
  frameCount: number,
  mode: LoopMode,
): PlaybackStep {
  const n = frameCount;
  if (n <= 1) return { index: 0, direction: 1, finished: true };
  const current = Math.min(Math.max(0, state.index), n - 1);
  if (mode === 'loop') return { index: (current + 1) % n, direction: 1, finished: false };
  if (mode === 'once') {
    if (current >= n - 1) return { index: n - 1, direction: 1, finished: true };
    return { index: current + 1, direction: 1, finished: false };
  }
  // Ida y vuelta: 0 1 … n-1 n-2 … 1 0 1 …
  let direction = state.direction;
  let next = current + direction;
  if (next >= n) {
    direction = -1;
    next = n - 2;
  } else if (next < 0) {
    direction = 1;
    next = 1;
  }
  return { index: next, direction, finished: false };
}
