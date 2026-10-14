import type { Platform } from './types.ts';
import { createWebPlatform } from './web.ts';

export type { OpenedFile, Platform, SavedFile, SaveMode } from './types.ts';
export { PlatformError } from './types.ts';

/** Verdadero dentro de la aplicación de escritorio (Tauri inyecta este objeto). */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

/**
 * Crea la plataforma adecuada. El adaptador de Tauri se carga bajo demanda
 * para que la versión web no incluya el código de escritorio en la carga
 * inicial.
 */
export async function createPlatform(): Promise<Platform> {
  if (isTauri()) {
    const { createTauriPlatform } = await import('./tauri.ts');
    return createTauriPlatform();
  }
  return createWebPlatform();
}
