import { invoke } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { PlatformError, type OpenedFile, type Platform, type SaveMode } from './types.ts';

/**
 * Plataforma de escritorio (Tauri 2).
 *
 * Los diálogos de abrir/guardar los muestra Rust y la ruta elegida nunca pasa
 * por JavaScript: el WebView solo envía bytes y un nombre sugerido. Rust
 * escribe de forma atómica (archivo temporal + reemplazo) y solo en la ruta
 * que eligió el usuario. El diálogo nativo pide confirmación antes de
 * sobrescribir un archivo existente.
 */

/** Cabeceras HTTP solo admiten ASCII: el nombre viaja codificado. */
function headers(values: Record<string, string>): Record<string, string> {
  return Object.fromEntries(Object.entries(values).map(([k, v]) => [k, encodeURIComponent(v)]));
}

/** Respuesta de `open_project`: [u32 LE longitud del nombre][nombre UTF-8][contenido]. */
export function decodeOpenResponse(buffer: ArrayBuffer): OpenedFile {
  const bytes = new Uint8Array(buffer);
  if (bytes.length < 4) throw new PlatformError('platform.badResponse');
  const nameLength = new DataView(buffer).getUint32(0, true);
  if (4 + nameLength > bytes.length) throw new PlatformError('platform.badResponse');
  return {
    name: new TextDecoder().decode(bytes.subarray(4, 4 + nameLength)),
    bytes: bytes.slice(4 + nameLength),
  };
}

function toPlatformError(error: unknown): PlatformError {
  const code = typeof error === 'string' ? error : 'platform.ioError';
  return new PlatformError(
    /^[a-z]+\.[A-Za-z]+$/.test(code) ? code : 'platform.ioError',
    String(error),
  );
}

export function createTauriPlatform(): Platform {
  return {
    kind: 'desktop',

    async openProject() {
      try {
        const result = await invoke<ArrayBuffer | null>('open_project');
        if (result === null || result.byteLength === 0) return null;
        return decodeOpenResponse(result);
      } catch (error) {
        throw toPlatformError(error);
      }
    },

    async saveProject(bytes: Uint8Array, suggestedName: string, mode: SaveMode) {
      try {
        const name = await invoke<string | null>('save_project', bytes, {
          headers: headers({ 'x-file-name': suggestedName, 'x-mode': mode }),
        });
        return name === null ? null : { name };
      } catch (error) {
        throw toPlatformError(error);
      }
    },

    async saveExport(bytes: Uint8Array, suggestedName: string) {
      try {
        const name = await invoke<string | null>('save_export', bytes, {
          headers: headers({ 'x-file-name': suggestedName }),
        });
        return name === null ? null : { name };
      } catch (error) {
        throw toPlatformError(error);
      }
    },

    async acceptOpenedProject() {
      await invoke('accept_opened_project');
    },

    async forgetProjectFile() {
      await invoke('forget_project_file');
    },

    onCloseRequested(handler) {
      let unlisten: (() => void) | null = null;
      let disposed = false;
      void getCurrentWindow()
        .onCloseRequested(async (event) => {
          const allow = await handler();
          if (!allow) event.preventDefault();
        })
        .then((fn) => {
          if (disposed) fn();
          else unlisten = fn;
        });
      return () => {
        disposed = true;
        unlisten?.();
      };
    },

    setTitle(title) {
      document.title = title;
      void getCurrentWindow().setTitle(title);
    },
  };
}
