import type { Issue } from '../core/errors.ts';
import type { SerializedProject } from './export-protocol.ts';
import type { MirroredProject } from './frame-mirror.ts';

/** Mensajes con el worker de proyectos (análisis y serialización). */

export type ProjectRequest =
  | {
      readonly type: 'parse';
      readonly id: number;
      readonly bytes: Uint8Array;
      readonly fileName?: string;
      readonly defaultName?: string;
    }
  | {
      readonly type: 'serialize';
      readonly id: number;
      readonly project: MirroredProject;
      readonly generator: { readonly name: string; readonly version: string };
    };

export type ProjectResponse =
  | {
      readonly type: 'parsed';
      readonly id: number;
      readonly ok: true;
      readonly project: SerializedProject;
      readonly warnings: readonly Issue[];
    }
  | {
      readonly type: 'parsed';
      readonly id: number;
      readonly ok: false;
      readonly errors: readonly Issue[];
    }
  | { readonly type: 'serialized'; readonly id: number; readonly bytes: Uint8Array }
  | { readonly type: 'failed'; readonly id: number; readonly code: string };
