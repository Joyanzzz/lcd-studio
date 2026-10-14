import { describe, expect, it } from 'vitest';
import type { Scheduler } from '../../../src/ui/state/editor-store.ts';
import { LimitNotice } from '../../../src/ui/state/limit-notice.ts';

/** Reloj manual: `advance(ms)` ejecuta los temporizadores vencidos. */
function fakeClock(): Scheduler & { advance: (ms: number) => void; pending: () => number } {
  let now = 0;
  let next = 1;
  const timers = new Map<number, { at: number; fn: () => void }>();
  return {
    setTimeout: (fn, ms) => {
      const id = next++;
      timers.set(id, { at: now + ms, fn });
      return id;
    },
    clearTimeout: (h) => {
      timers.delete(h as number);
    },
    advance: (ms) => {
      now += ms;
      for (const [id, t] of [...timers]) {
        if (t.at <= now) {
          timers.delete(id);
          t.fn();
        }
      }
    },
    pending: () => timers.size,
  };
}

describe('aviso único del límite', () => {
  it('visible durante el intento y oculto 5 s después de terminar', () => {
    const clock = fakeClock();
    const n = new LimitNotice({ scheduler: clock });
    n.begin();
    expect(n.getState()).toEqual({ visible: true, active: true, shownCount: 1 });
    clock.advance(60_000); // el intento sigue: no se oculta
    expect(n.getState().visible).toBe(true);
    n.end();
    clock.advance(4999);
    expect(n.getState()).toMatchObject({ visible: true, active: false });
    clock.advance(1);
    expect(n.getState().visible).toBe(false);
  });

  it('intentos sucesivos reutilizan el mismo aviso y reinician la espera', () => {
    const clock = fakeClock();
    const n = new LimitNotice({ scheduler: clock });
    const seen: boolean[] = [];
    n.subscribe(() => seen.push(n.getState().visible));
    n.begin();
    n.end();
    clock.advance(3000);
    n.begin(); // nuevo intento antes de ocultarse
    n.begin(); // movimientos dentro del mismo intento
    n.begin();
    expect(n.getState().shownCount).toBe(1);
    n.end();
    clock.advance(4000);
    expect(n.getState().visible).toBe(true);
    clock.advance(1000);
    expect(n.getState().visible).toBe(false);
    expect(clock.pending()).toBe(0);
    // Nunca se ocultó y volvió a mostrar entre medias.
    expect(seen.filter((v) => !v)).toHaveLength(1);
  });

  it('una edición válida lo limpia y cerrarlo no deja temporizadores', () => {
    const clock = fakeClock();
    const n = new LimitNotice({ scheduler: clock });
    n.handle('active');
    n.handle('ended');
    n.handle('cleared');
    expect(n.getState().visible).toBe(false);
    expect(clock.pending()).toBe(0);
    n.handle('active');
    expect(n.getState().shownCount).toBe(2);
    n.dismiss();
    expect(n.getState().visible).toBe(false);
    n.handle('ended'); // terminar tras cerrarlo no lo vuelve a mostrar
    expect(n.getState().visible).toBe(false);
    expect(clock.pending()).toBe(0);
  });

  it('el número de apariciones solo cambia al aparecer (sin anuncios repetidos)', () => {
    const n = new LimitNotice({ scheduler: fakeClock() });
    for (let i = 0; i < 50; i++) n.begin();
    expect(n.getState().shownCount).toBe(1);
    n.dispose();
  });
});
