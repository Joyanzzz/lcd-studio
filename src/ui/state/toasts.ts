/** Cola de notificaciones (sustituye a `alert`). */

export type ToastKind = 'info' | 'success' | 'warning' | 'error';

export interface Toast {
  readonly id: number;
  readonly kind: ToastKind;
  /** Clave de traducción y parámetros, o texto ya traducido. */
  readonly key: string;
  readonly params?: Readonly<Record<string, string | number>>;
}

export class ToastStore {
  private toasts: readonly Toast[] = [];
  private nextId = 1;
  private readonly listeners = new Set<() => void>();
  private readonly timers = new Map<number, ReturnType<typeof setTimeout>>();

  getState = (): readonly Toast[] => this.toasts;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  /** Los errores permanecen hasta que se descartan; el resto desaparece solo. */
  push(kind: ToastKind, key: string, params?: Record<string, string | number>): number {
    const id = this.nextId++;
    const toast: Toast = params ? { id, kind, key, params } : { id, kind, key };
    this.toasts = [...this.toasts.slice(-4), toast];
    this.emit();
    if (kind !== 'error') {
      this.timers.set(
        id,
        setTimeout(() => this.dismiss(id), kind === 'warning' ? 9000 : 5000),
      );
    }
    return id;
  }

  dismiss(id: number): void {
    const timer = this.timers.get(id);
    if (timer) clearTimeout(timer);
    this.timers.delete(id);
    const next = this.toasts.filter((t) => t.id !== id);
    if (next.length !== this.toasts.length) {
      this.toasts = next;
      this.emit();
    }
  }

  private emit(): void {
    for (const l of this.listeners) l();
  }
}
