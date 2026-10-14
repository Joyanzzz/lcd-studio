import { AppError, fail, ok, type Result } from '../core/errors.ts';
import type { Generator, ParseOptions } from '../core/project-format.ts';
import type { Project } from '../core/project.ts';
import { deserializeProject } from './export-runner.ts';
import { FrameMirrorClient } from './frame-mirror.ts';
import type { ProjectRequest, ProjectResponse } from './project-protocol.ts';

/**
 * Cliente del worker de proyectos. El trabajo pesado (JSON, base64,
 * empaquetado de bits) ocurre fuera del hilo de la interfaz; aquí solo se
 * copian los arreglos de píxeles.
 */
export class ProjectWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, (r: ProjectResponse) => void>();
  private readonly factory: () => Worker;
  private readonly mirror = new FrameMirrorClient();

  constructor(factory: () => Worker) {
    this.factory = factory;
  }

  private send(request: ProjectRequest, transfer: Transferable[]): Promise<ProjectResponse> {
    if (!this.worker) {
      const worker = this.factory();
      worker.onmessage = (event: MessageEvent<ProjectResponse>) => {
        const resolve = this.pending.get(event.data.id);
        this.pending.delete(event.data.id);
        resolve?.(event.data);
      };
      worker.onerror = (event) => {
        event.preventDefault();
        for (const [id, resolve] of this.pending)
          resolve({ type: 'failed', id, code: 'project.invalid' });
        this.pending.clear();
        this.worker?.terminate();
        this.worker = null;
        this.mirror.reset();
      };
      this.worker = worker;
    }
    const worker = this.worker;
    return new Promise((resolve) => {
      this.pending.set(request.id, resolve);
      worker.postMessage(request, transfer);
    });
  }

  async parse(bytes: Uint8Array, options: ParseOptions = {}): Promise<Result<Project>> {
    const id = this.nextId++;
    const copy = bytes.slice();
    const response = await this.send(
      {
        type: 'parse',
        id,
        bytes: copy,
        ...(options.fileName !== undefined ? { fileName: options.fileName } : {}),
        ...(options.defaultName !== undefined ? { defaultName: options.defaultName } : {}),
      },
      [copy.buffer],
    );
    if (response.type === 'failed') return fail([{ code: response.code }]);
    if (response.type !== 'parsed') return fail([{ code: 'project.invalid' }]);
    if (!response.ok) return fail(response.errors);
    try {
      return ok(deserializeProject(response.project), response.warnings);
    } catch {
      return fail([{ code: 'project.invalid' }]);
    }
  }

  async serialize(project: Project, generator: Generator): Promise<Uint8Array> {
    const id = this.nextId++;
    const encoded = this.mirror.encode(project);
    const response = await this.send(
      { type: 'serialize', id, project: encoded.project, generator },
      encoded.transfer,
    );
    if (response.type !== 'serialized')
      throw new AppError(response.type === 'failed' ? response.code : 'project.invalid');
    return response.bytes;
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.pending.clear();
    this.mirror.reset();
  }
}
