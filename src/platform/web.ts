import { LIMITS } from '../core/limits.ts';
import { PlatformError, type OpenedFile, type Platform } from './types.ts';

/**
 * Plataforma web: selector de archivos del navegador y descargas. Nunca envía
 * datos a ningún servidor: todo ocurre en memoria del navegador.
 */

function pickFile(accept: string): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = accept;
    input.hidden = true;
    let settled = false;
    const finish = (file: File | null) => {
      if (settled) return;
      settled = true;
      input.remove();
      resolve(file);
    };
    input.addEventListener('change', () => finish(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => finish(null));
    document.body.append(input);
    input.click();
  });
}

export function downloadBytes(bytes: Uint8Array, name: string, mime: string): void {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  a.hidden = true;
  document.body.append(a);
  a.click();
  a.remove();
  // Se libera después de que el navegador inicie la descarga.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

export async function readFileLimited(
  file: File,
  maxBytes: number,
  code: string,
): Promise<Uint8Array> {
  if (file.size > maxBytes) throw new PlatformError(code);
  return new Uint8Array(await file.arrayBuffer());
}

export function createWebPlatform(): Platform {
  return {
    kind: 'web',

    async openProject(): Promise<OpenedFile | null> {
      const file = await pickFile('.json,.lcdstudio.json,application/json');
      if (!file) return null;
      return {
        name: file.name,
        bytes: await readFileLimited(file, LIMITS.projectMaxFileBytes, 'project.fileTooLarge'),
      };
    },

    async saveProject(bytes, suggestedName) {
      downloadBytes(bytes, suggestedName, 'application/json');
      return { name: suggestedName };
    },

    async saveExport(bytes, suggestedName, mime) {
      downloadBytes(bytes, suggestedName, mime);
      return { name: suggestedName };
    },

    async acceptOpenedProject() {
      // En web no hay archivo asociado.
    },

    async forgetProjectFile() {
      // En web no hay archivo asociado: cada guardado es una descarga.
    },

    onCloseRequested() {
      // El aviso de cierre en web lo gestiona `beforeunload` en la interfaz.
      return () => undefined;
    },

    setTitle(title) {
      document.title = title;
    },
  };
}
