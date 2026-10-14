import type { Project } from '../core/project.ts';

/**
 * Envío incremental de fotogramas a un worker.
 *
 * Los arreglos de píxeles de un proyecto son inmutables, así que cada uno
 * recibe un número la primera vez que se envía y después solo viaja ese
 * número. El worker conserva solo los arreglos del último proyecto recibido;
 * el cliente lleva exactamente la misma cuenta, de modo que un arreglo que
 * vuelve tras deshacer se envía de nuevo. Si el worker se reinicia, el
 * cliente debe llamar a `reset()`.
 */

export interface MirroredFrame {
  readonly durationMs: number;
  readonly token: number;
  /** Solo presente la primera vez que se envía este arreglo. */
  readonly pixels?: Uint8Array;
}

export interface MirroredProject {
  readonly name: string;
  readonly profileId: string;
  readonly width: number;
  readonly height: number;
  readonly appearance: unknown;
  readonly loopMode: string;
  readonly romCharset: string;
  readonly frames: readonly MirroredFrame[];
}

/** Lado del hilo de la interfaz. */
export class FrameMirrorClient {
  /** Arreglos que el worker tiene ahora mismo (los del último envío). */
  private tokens = new Map<Uint8Array, number>();
  private next = 1;

  /** Proyecto a enviar y búferes transferibles (las copias nuevas). */
  encode(project: Project): { project: MirroredProject; transfer: ArrayBuffer[] } {
    const transfer: ArrayBuffer[] = [];
    const sent = new Map<Uint8Array, number>();
    const frames = project.frames.map((f): MirroredFrame => {
      const known = this.tokens.get(f.pixels) ?? sent.get(f.pixels);
      if (known !== undefined) {
        sent.set(f.pixels, known);
        return { durationMs: f.durationMs, token: known };
      }
      const token = this.next++;
      sent.set(f.pixels, token);
      const copy = f.pixels.slice();
      transfer.push(copy.buffer);
      return { durationMs: f.durationMs, token, pixels: copy };
    });
    this.tokens = sent;
    return {
      project: {
        name: project.name,
        profileId: project.profileId,
        width: project.width,
        height: project.height,
        appearance: project.appearance,
        loopMode: project.loopMode,
        romCharset: project.romCharset,
        frames,
      },
      transfer,
    };
  }

  /** El worker perdió su copia (se terminó): todo se volverá a enviar. */
  reset(): void {
    this.tokens = new Map();
  }
}

/** Lado del worker. */
export class FrameMirrorStore {
  private readonly frames = new Map<number, Uint8Array>();

  /** Reconstruye los fotogramas y descarta los que ya no se usan. */
  decode(project: MirroredProject): { durationMs: number; pixels: Uint8Array }[] {
    for (const f of project.frames) if (f.pixels) this.frames.set(f.token, f.pixels);
    const used = new Set(project.frames.map((f) => f.token));
    for (const token of [...this.frames.keys()]) if (!used.has(token)) this.frames.delete(token);
    return project.frames.map((f) => {
      const pixels = this.frames.get(f.token);
      if (!pixels) throw new Error('Fotograma desconocido');
      return { durationMs: f.durationMs, pixels };
    });
  }

  get size(): number {
    return this.frames.size;
  }
}
