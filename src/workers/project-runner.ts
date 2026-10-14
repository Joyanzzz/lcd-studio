import { isAppError } from '../core/errors.ts';
import { parseProjectFile, serializeProject } from '../core/project-format.ts';
import { deserializeProject } from './export-runner.ts';
import { FrameMirrorStore } from './frame-mirror.ts';
import type { ProjectRequest, ProjectResponse } from './project-protocol.ts';

interface Handled {
  readonly response: ProjectResponse;
  readonly transfer: ArrayBuffer[];
}

/** Lógica del worker de proyectos (probable en Node), con su copia de fotogramas. */
export function createProjectHandler(): (request: ProjectRequest) => Handled {
  const store = new FrameMirrorStore();
  return (request) => {
    try {
      if (request.type === 'parse') {
        const result = parseProjectFile(request.bytes, {
          ...(request.fileName !== undefined ? { fileName: request.fileName } : {}),
          ...(request.defaultName !== undefined ? { defaultName: request.defaultName } : {}),
        });
        if (!result.ok) {
          return {
            response: { type: 'parsed', id: request.id, ok: false, errors: result.errors },
            transfer: [],
          };
        }
        const p = result.value;
        const frames = p.frames.map((f) => ({ durationMs: f.durationMs, pixels: f.pixels }));
        return {
          response: {
            type: 'parsed',
            id: request.id,
            ok: true,
            warnings: result.warnings,
            project: {
              name: p.name,
              profileId: p.profileId,
              width: p.width,
              height: p.height,
              appearance: p.appearance,
              loopMode: p.loopMode,
              romCharset: p.romCharset,
              frames,
            },
          },
          transfer: frames.map((f) => f.pixels.buffer as ArrayBuffer),
        };
      }
      const project = deserializeProject({
        ...request.project,
        frames: store.decode(request.project),
      });
      const bytes = serializeProject(project, request.generator);
      return {
        response: { type: 'serialized', id: request.id, bytes },
        transfer: [bytes.buffer as ArrayBuffer],
      };
    } catch (error) {
      return {
        response: {
          type: 'failed',
          id: request.id,
          code: isAppError(error) ? error.code : 'project.invalid',
        },
        transfer: [],
      };
    }
  };
}
