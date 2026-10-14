import type { Diagnostic, ExportOutcome, MemoryEstimate } from '../exporters/types.ts';
import type { MirroredProject } from './frame-mirror.ts';

/** Proyecto completo (fotogramas incluidos) para enviar entre hilos. */
export interface SerializedProject {
  readonly name: string;
  readonly profileId: string;
  readonly width: number;
  readonly height: number;
  readonly appearance: unknown;
  readonly loopMode: string;
  readonly romCharset: string;
  readonly frames: readonly { readonly durationMs: number; readonly pixels: Uint8Array }[];
}

/** Mensajes con el worker de exportación. */
export interface ExportRequest {
  readonly id: number;
  /** `inspect`: solo validación y estimación; `export`: genera los archivos. */
  readonly kind: 'inspect' | 'export';
  readonly exporterId: string;
  readonly options: unknown;
  readonly project: MirroredProject;
  readonly currentFrame: number;
  readonly appVersion: string;
  readonly experimental: boolean;
}

export type ExportResponse =
  | { readonly id: number; readonly type: 'done'; readonly outcome: ExportOutcome }
  | {
      readonly id: number;
      readonly type: 'inspected';
      readonly options: object;
      readonly diagnostics: readonly Diagnostic[];
      readonly estimate: MemoryEstimate;
    }
  | { readonly id: number; readonly type: 'error'; readonly code: string };
