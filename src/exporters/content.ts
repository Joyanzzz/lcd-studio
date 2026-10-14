import { defaultDevice } from '../core/device.ts';
import { createFrame, type Project } from '../core/project.ts';
import { getProfile, targetsFor, type DisplayProfile } from '../device-profiles/index.ts';
import { clipRect, type Rect } from '../engine/selection.ts';
import { EXPORTERS } from './index.ts';
import type { ExportContent, Exporter } from './types.ts';

/**
 * Contenido a exportar y formatos compatibles. Lo usa el asistente de
 * exportación; las reglas viven aquí (no solo en controles deshabilitados).
 */

export type FormatGroup = 'image' | 'data' | 'code';

/**
 * Proyecto que recibe el exportador para el contenido elegido. La selección
 * se exporta como una imagen de su tamaño (perfil gráfico genérico): no es
 * una pantalla completa, así que no admite código de dispositivo.
 */
export function projectForContent(
  project: Project,
  content: ExportContent,
  currentFrame: number,
  selection: Rect | null,
): { project: Project; currentFrame: number } | null {
  if (content !== 'selection') return { project, currentFrame };
  const rect = selection ? clipRect(selection, project.width, project.height) : null;
  if (!rect) return null;
  const source = project.frames[currentFrame]!;
  const pixels = new Uint8Array(rect.width * rect.height);
  for (let y = 0; y < rect.height; y++) {
    const from = (rect.y + y) * project.width + rect.x;
    pixels.set(source.pixels.subarray(from, from + rect.width), y * rect.width);
  }
  const profile = getProfile('graphic-custom')!;
  return {
    project: Object.freeze({
      ...project,
      profileId: profile.id,
      width: rect.width,
      height: rect.height,
      romCharset: 'none',
      device: defaultDevice(profile),
      frames: Object.freeze([createFrame(pixels, source.durationMs)]),
    }),
    currentFrame: 0,
  };
}

/** Grupo del asistente: imagen, datos de mapa de bits (bytes) o código. */
export function formatGroup(exporter: Exporter<object>): FormatGroup {
  return exporter.category;
}

export interface FormatChoice {
  readonly exporter: Exporter<object>;
  readonly group: FormatGroup;
  /** Clave de la razón por la que no se ofrece (o `null` si está disponible). */
  readonly unavailableKey: string | null;
}

/**
 * Formatos para el perfil y el contenido. Los de código se limitan a los
 * destinos compatibles con la conexión configurada (todos los del perfil si
 * aún no hay conexión). Los experimentales solo si están activados.
 */
export function formatChoices(
  profile: DisplayProfile,
  project: Project,
  content: ExportContent,
  experimental: boolean,
): FormatChoice[] {
  const codeTargets = new Set(
    targetsFor(profile, project.device.connection).map((t) => t.exporterId),
  );
  const out: FormatChoice[] = [];
  for (const e of EXPORTERS) {
    if (!e.supports(profile) || (!experimental && e.stability === 'experimental')) continue;
    if (e.category === 'code' && !codeTargets.has(e.id)) continue;
    let unavailableKey: string | null = null;
    if (!e.contents.includes(content)) {
      unavailableKey =
        content === 'selection'
          ? 'export.reason.needsFullDisplay'
          : content === 'frame'
            ? 'export.reason.needsAnimation'
            : 'export.reason.singleFrame';
    } else if (content === 'animation' && e.contents.length === 1 && project.frames.length < 2) {
      unavailableKey = 'export.reason.needsFrames';
    }
    out.push({ exporter: e, group: formatGroup(e), unavailableKey });
  }
  return out;
}

/** Ajusta la opción de alcance de los exportadores que la tienen. */
export function optionsForContent(
  raw: Readonly<Record<string, unknown>>,
  content: ExportContent,
): Record<string, unknown> {
  return { ...raw, frames: content === 'animation' ? 'all' : 'current' };
}
