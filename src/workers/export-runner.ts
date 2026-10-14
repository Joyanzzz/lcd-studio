import { isValidAppearance, type Appearance } from '../core/appearance.ts';
import { createFrame, isLoopMode, projectInvariantErrors, type Project } from '../core/project.ts';
import { getProfile, isRomCharsetId } from '../device-profiles/index.ts';
import { getExporter, inspectExport, runExport } from '../exporters/index.ts';
import type { ExportRequest, ExportResponse, SerializedProject } from './export-protocol.ts';
import { FrameMirrorStore } from './frame-mirror.ts';

/** Reconstruye y valida un proyecto recibido de otro hilo; lanza si no es válido. */
export function deserializeProject(s: SerializedProject): Project {
  if (!isLoopMode(s.loopMode) || !isRomCharsetId(s.romCharset))
    throw new Error('Proyecto no válido');
  const appearance = s.appearance as Appearance;
  if (!isValidAppearance(appearance)) throw new Error('Proyecto no válido');
  const project: Project = {
    name: s.name,
    profileId: s.profileId,
    width: s.width,
    height: s.height,
    appearance,
    loopMode: s.loopMode,
    romCharset: s.romCharset,
    frames: s.frames.map((f) => createFrame(f.pixels, f.durationMs)),
  };
  if (projectInvariantErrors(project).length > 0) throw new Error('Proyecto no válido');
  return project;
}

/** Lógica del worker de exportación (probable en Node), con su copia de fotogramas. */
export function createExportHandler(): (request: ExportRequest) => ExportResponse {
  const store = new FrameMirrorStore();
  return (request) => {
    const exporter = getExporter(request.exporterId);
    if (!exporter || (exporter.stability === 'experimental' && !request.experimental)) {
      return { id: request.id, type: 'error', code: 'export.internal' };
    }
    let project: Project;
    try {
      project = deserializeProject({ ...request.project, frames: store.decode(request.project) });
    } catch {
      return { id: request.id, type: 'error', code: 'project.invalid' };
    }
    const ctx = {
      project,
      profile: getProfile(project.profileId)!,
      currentFrame: request.currentFrame,
      appVersion: request.appVersion,
    };
    if (request.kind === 'inspect') {
      const r = inspectExport(exporter, ctx, request.options);
      return {
        id: request.id,
        type: 'inspected',
        options: r.options,
        diagnostics: r.diagnostics,
        estimate: r.estimate,
      };
    }
    return { id: request.id, type: 'done', outcome: runExport(exporter, ctx, request.options) };
  };
}
