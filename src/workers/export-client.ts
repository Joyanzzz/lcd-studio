import { AppError } from '../core/errors.ts';
import type { Project } from '../core/project.ts';
import type { Diagnostic, ExportOutcome, MemoryEstimate } from '../exporters/types.ts';
import type { ExportRequest, ExportResponse } from './export-protocol.ts';
import { FrameMirrorClient } from './frame-mirror.ts';

export interface Inspection {
  readonly options: object;
  readonly diagnostics: readonly Diagnostic[];
  readonly estimate: MemoryEstimate;
}

interface Pending {
  resolve: (r: ExportResponse) => void;
  reject: (e: unknown) => void;
}

/**
 * Cliente del worker de exportación. La validación (`inspect`) y la
 * generación (`run`) ocurren en el worker; cancelar termina el worker.
 */
export class ExportWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly mirror = new FrameMirrorClient();
  private readonly factory: () => Worker;
  private running: number | null = null;

  constructor(factory: () => Worker) {
    this.factory = factory;
  }

  private ensure(): Worker {
    if (this.worker) return this.worker;
    const worker = this.factory();
    worker.onmessage = (event: MessageEvent<ExportResponse>) => {
      const entry = this.pending.get(event.data.id);
      this.pending.delete(event.data.id);
      if (this.running === event.data.id) this.running = null;
      entry?.resolve(event.data);
    };
    worker.onerror = (event) => {
      event.preventDefault();
      this.terminate(new AppError('export.internal'));
    };
    this.worker = worker;
    return worker;
  }

  private send(
    kind: ExportRequest['kind'],
    exporterId: string,
    project: Project,
    options: unknown,
    currentFrame: number,
    appVersion: string,
    experimental: boolean,
  ): Promise<ExportResponse> {
    const worker = this.ensure();
    const id = this.nextId++;
    const encoded = this.mirror.encode(project);
    const request: ExportRequest = {
      id,
      kind,
      exporterId,
      options,
      project: encoded.project,
      currentFrame,
      appVersion,
      experimental,
    };
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      if (kind === 'export') this.running = id;
      worker.postMessage(request, encoded.transfer);
    });
  }

  async inspect(
    exporterId: string,
    project: Project,
    options: unknown,
    currentFrame: number,
    appVersion: string,
    experimental: boolean,
  ): Promise<Inspection> {
    const r = await this.send(
      'inspect',
      exporterId,
      project,
      options,
      currentFrame,
      appVersion,
      experimental,
    );
    if (r.type === 'inspected')
      return { options: r.options, diagnostics: r.diagnostics, estimate: r.estimate };
    throw new AppError(r.type === 'error' ? r.code : 'export.internal');
  }

  async run(
    exporterId: string,
    project: Project,
    options: unknown,
    currentFrame: number,
    appVersion: string,
    experimental: boolean,
  ): Promise<ExportOutcome> {
    this.cancel();
    const r = await this.send(
      'export',
      exporterId,
      project,
      options,
      currentFrame,
      appVersion,
      experimental,
    );
    if (r.type === 'done') return r.outcome;
    throw new AppError(r.type === 'error' ? r.code : 'export.internal');
  }

  /** Cancela una generación en curso (termina el worker). */
  cancel(): void {
    if (this.running !== null) this.terminate(new AppError('task.cancelled'));
  }

  private terminate(reason: unknown): void {
    for (const entry of this.pending.values()) entry.reject(reason);
    this.pending.clear();
    this.running = null;
    this.worker?.terminate();
    this.worker = null;
    this.mirror.reset();
  }

  dispose(): void {
    this.terminate(new AppError('task.cancelled'));
  }
}
