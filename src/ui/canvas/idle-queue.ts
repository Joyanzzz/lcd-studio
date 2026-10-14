/**
 * Cola de trabajos pequeños que se ejecutan en lotes de como máximo
 * `budgetMs`, cediendo el hilo entre lotes. Sirve para pintar muchas
 * miniaturas sin bloquear la interfaz.
 */
export class IdleQueue {
  private readonly jobs = new Map<number, () => void>();
  private nextId = 1;
  private scheduled = false;
  private readonly budgetMs: number;
  private readonly schedule: (fn: () => void) => void;
  private readonly now: () => number;

  constructor(
    budgetMs = 8,
    schedule: (fn: () => void) => void = (fn) => setTimeout(fn, 0),
    now: () => number = () => performance.now(),
  ) {
    this.budgetMs = budgetMs;
    this.schedule = schedule;
    this.now = now;
  }

  /** Añade un trabajo; devuelve una función para cancelarlo. */
  add(job: () => void): () => void {
    const id = this.nextId++;
    this.jobs.set(id, job);
    this.kick();
    return () => this.jobs.delete(id);
  }

  get pending(): number {
    return this.jobs.size;
  }

  private kick(): void {
    if (this.scheduled) return;
    this.scheduled = true;
    this.schedule(() => this.run());
  }

  private run(): void {
    this.scheduled = false;
    const start = this.now();
    for (const [id, job] of this.jobs) {
      this.jobs.delete(id);
      job();
      if (this.now() - start >= this.budgetMs) break;
    }
    if (this.jobs.size > 0) this.kick();
  }
}

/** Cola compartida para miniaturas. */
export const thumbnailQueue = new IdleQueue();
