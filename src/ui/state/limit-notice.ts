import type { Scheduler } from './editor-store.ts';

/**
 * Aviso único del límite de caracteres propios.
 *
 * - Un intento no permitido lo muestra (`begin`) y lo mantiene visible
 *   mientras dura; al terminar (`end`) se oculta `lingerMs` después.
 * - Un intento nuevo antes de ocultarse reutiliza el mismo aviso y reinicia
 *   la espera al terminar. Nunca hay más de un aviso.
 * - Una edición válida o el cambio de proyecto lo ocultan (`clear`); el
 *   usuario puede cerrarlo (`dismiss`) sin tocar el dibujo.
 * - `shownCount` solo aumenta cuando pasa de oculto a visible: la región viva
 *   que lo anuncia no se vuelve a anunciar en cada movimiento del puntero.
 */

export interface LimitNoticeState {
  readonly visible: boolean;
  /** Hay un intento no permitido en curso. */
  readonly active: boolean;
  /** Veces que se ha mostrado (cambia solo al aparecer). */
  readonly shownCount: number;
}

export const LIMIT_NOTICE_LINGER_MS = 5000;

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class LimitNotice {
  private state: LimitNoticeState = { visible: false, active: false, shownCount: 0 };
  private timer: unknown = null;
  private readonly listeners = new Set<() => void>();
  private readonly scheduler: Scheduler;
  private readonly lingerMs: number;

  constructor(options: { scheduler?: Scheduler; lingerMs?: number } = {}) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.lingerMs = options.lingerMs ?? LIMIT_NOTICE_LINGER_MS;
  }

  getState = (): LimitNoticeState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Empieza (o continúa) un intento no permitido. */
  begin(): void {
    this.cancelTimer();
    if (this.state.visible && this.state.active) return;
    this.set({
      visible: true,
      active: true,
      shownCount: this.state.visible ? this.state.shownCount : this.state.shownCount + 1,
    });
  }

  /** Termina el intento: el aviso sigue visible `lingerMs` y después se oculta. */
  end(): void {
    if (!this.state.visible) return;
    this.cancelTimer();
    if (this.state.active) this.set({ ...this.state, active: false });
    this.timer = this.scheduler.setTimeout(() => {
      this.timer = null;
      this.hide();
    }, this.lingerMs);
  }

  /** Edición válida o proyecto nuevo: oculta el aviso de inmediato. */
  clear(): void {
    this.hide();
  }

  /** Cierre explícito (botón o Escape). */
  dismiss(): void {
    this.hide();
  }

  /** Aplica un evento del almacén del editor. */
  handle(phase: 'active' | 'ended' | 'cleared'): void {
    if (phase === 'active') this.begin();
    else if (phase === 'ended') this.end();
    else this.clear();
  }

  dispose(): void {
    this.cancelTimer();
    this.listeners.clear();
  }

  private hide(): void {
    this.cancelTimer();
    if (this.state.visible || this.state.active) {
      this.set({ visible: false, active: false, shownCount: this.state.shownCount });
    }
  }

  private cancelTimer(): void {
    if (this.timer !== null) this.scheduler.clearTimeout(this.timer);
    this.timer = null;
  }

  private set(state: LimitNoticeState): void {
    this.state = state;
    for (const l of this.listeners) l();
  }
}
