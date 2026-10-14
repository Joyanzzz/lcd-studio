import { overLimitFrames } from '../core/constraints.ts';
import type { DeviceConfig } from '../core/device.ts';
import { isAppError } from '../core/errors.ts';
import { safeFileName } from '../core/names.ts';
import { PROJECT_EXTENSION } from '../core/project-format.ts';
import { createProject, type Project } from '../core/project.ts';
import { PlatformError, type SaveMode } from '../platform/index.ts';
import type { AppServices } from './app-context.tsx';

/** Acciones de archivo compartidas por la barra de herramientas, los atajos y los diálogos. */

export const GENERATOR_NAME = 'LCD Studio';

/** Serializa en el worker de proyectos (no bloquea la interfaz). */
export function serialize(services: AppServices, project: Project): Promise<Uint8Array> {
  return services.projects.serialize(project, {
    name: GENERATOR_NAME,
    version: services.appVersion,
  });
}

function reportError(services: AppServices, error: unknown): void {
  if (isAppError(error)) services.toasts.push('error', error.code, { ...error.params });
  else if (error instanceof PlatformError) services.toasts.push('error', error.code);
  else
    services.toasts.push('error', 'toast.error', {
      message: error instanceof Error ? error.message : String(error),
    });
}

export function newProject(
  services: AppServices,
  options: {
    name: string;
    profileId: string;
    width?: number;
    height?: number;
    device?: DeviceConfig;
  },
): boolean {
  try {
    const project = createProject(options);
    services.store.loadProject(project, false);
    void services.platform.forgetProjectFile();
    services.autosave.markDirty();
    return true;
  } catch (error) {
    reportError(services, error);
    return false;
  }
}

/**
 * Abre un proyecto. La validación es completa antes de tocar el estado: si el
 * archivo no es válido, el proyecto actual queda exactamente igual.
 */
export async function openProject(services: AppServices, migratedName: string): Promise<boolean> {
  let file;
  try {
    file = await services.platform.openProject();
  } catch (error) {
    reportError(services, error);
    return false;
  }
  if (!file) return false;
  const result = await services.projects.parse(file.bytes, {
    fileName: file.name,
    defaultName: migratedName,
  });
  if (!result.ok) {
    services.toasts.push('error', 'toast.openFailed');
    for (const issue of result.errors.slice(0, 3)) {
      services.toasts.push('error', issue.code, {
        ...(issue.params ?? {}),
        ...(issue.path ? { path: issue.path } : {}),
      });
    }
    return false;
  }
  const project = result.value;
  // Un proyecto migrado aún no está guardado en formato v2.
  const migrated = result.warnings.some((w) => w.code === 'migration.fromV1');
  services.store.loadProject(project, migrated);
  await services.platform.acceptOpenedProject();
  services.autosave.markDirty();
  services.toasts.push('success', 'toast.projectOpened', { name: project.name });
  // Proyecto antiguo por encima del límite: se abre completo, en estado de reparación.
  const over = overLimitFrames(project);
  if (over.length > 0) services.toasts.push('warning', 'repair.opened', { frames: over.length });
  for (const w of result.warnings) {
    services.toasts.push(w.code === 'migration.fromV1' ? 'info' : 'warning', w.code, {
      ...(w.params ?? {}),
    });
  }
  return true;
}

export async function saveProject(services: AppServices, mode: SaveMode): Promise<boolean> {
  const project = services.store.getState().project;
  try {
    const bytes = await serialize(services, project);
    const saved = await services.platform.saveProject(
      bytes,
      safeFileName(project.name, PROJECT_EXTENSION),
      mode,
    );
    if (!saved) {
      services.toasts.push('info', 'toast.saveCancelled');
      return false;
    }
    services.store.markFileSaved();
    services.autosave.markDirty();
    services.toasts.push(
      'success',
      services.platform.kind === 'web' ? 'toast.projectDownloaded' : 'toast.projectSaved',
      { name: saved.name },
    );
    return true;
  } catch (error) {
    reportError(services, error);
    return false;
  }
}

export { reportError };
