import type { RecoveryRecord, RecoveryStore } from './recovery-store.ts';

/**
 * Autoguardado con estado visible: inactivo → pendiente → guardando →
 * guardado o error. Agrupa cambios seguidos (espera `delayMs`) y nunca
 * ejecuta dos escrituras a la vez.
 */

export type SaveStatus = 'idle' | 'pending' | 'saving' | 'saved' | 'error';

export interface AutosaveOptions {
  readonly store: RecoveryStore;
  /** Serializa el estado actual; se llama justo antes de escribir. */
  /** Serializa el estado actual; se llama justo antes de escribir. Puede ser asíncrona (worker). */
  readonly snapshot: () => RecoveryRecord | Promise<RecoveryRecord>;
  readonly delayMs?: number;
  readonly onStatus?: (status: SaveStatus, error?: unknown) => void;
  readonly setTimer?: (fn: () => void, ms: number) => unknown;
  readonly clearTimer?: (handle: unknown) => void;
}

export class Autosave {
  private status: SaveStatus = 'idle';
  private version = 0;
  private savedVersion = 0;
  private timer: unknown = null;
  private running: Promise<void> | null = null;
  private readonly opts: Required<Omit<AutosaveOptions, 'onStatus'>> &
    Pick<AutosaveOptions, 'onStatus'>;

  constructor(options: AutosaveOptions) {
    this.opts = {
      delayMs: 600,
      setTimer: (fn, ms) => setTimeout(fn, ms),
      clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      ...options,
    };
  }

  get currentStatus(): SaveStatus {
    return this.status;
  }

  /** Verdadero si hay cambios que aún no están en el almacén. */
  get hasUnpersistedChanges(): boolean {
    return this.savedVersion !== this.version;
  }

  /** Marca un cambio y programa el guardado. */
  markDirty(): void {
    this.version++;
    this.setStatus('pending');
    if (this.timer !== null) this.opts.clearTimer(this.timer);
    this.timer = this.opts.setTimer(() => {
      this.timer = null;
      void this.flush();
    }, this.opts.delayMs);
  }

  /** Guarda inmediatamente lo pendiente. Resuelve cuando todo está escrito (o falló). */
  async flush(): Promise<void> {
    if (this.timer !== null) {
      this.opts.clearTimer(this.timer);
      this.timer = null;
    }
    while (this.running) await this.running;
    if (!this.hasUnpersistedChanges) return;
    const target = this.version;
    this.setStatus('saving');
    this.running = (async () => {
      try {
        await this.opts.store.save(await this.opts.snapshot());
        this.savedVersion = target;
        this.setStatus(this.hasUnpersistedChanges ? 'pending' : 'saved');
      } catch (error) {
        this.setStatus('error', error);
      } finally {
        this.running = null;
      }
    })();
    await this.running;
    if (this.hasUnpersistedChanges && this.status !== 'error' && this.timer === null) {
      await this.flush();
    }
  }

  /** Considera guardado el estado actual (p. ej. tras abrir un archivo). */
  markClean(): void {
    this.savedVersion = this.version;
    this.setStatus('idle');
  }

  dispose(): void {
    if (this.timer !== null) this.opts.clearTimer(this.timer);
    this.timer = null;
  }

  private setStatus(status: SaveStatus, error?: unknown): void {
    this.status = status;
    this.opts.onStatus?.(status, error);
  }
}
