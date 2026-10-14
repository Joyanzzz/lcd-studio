/**
 * Operaciones que dependen del entorno (navegador o escritorio). El resto de
 * la aplicación solo usa esta interfaz: los bytes que se guardan los generan
 * siempre el núcleo y los exportadores, idénticos en ambas plataformas.
 */

export interface OpenedFile {
  readonly name: string;
  readonly bytes: Uint8Array;
}

export interface SavedFile {
  readonly name: string;
}

export type SaveMode = 'save' | 'saveAs';

export interface Platform {
  readonly kind: 'web' | 'desktop';
  /** Abre un proyecto elegido por el usuario. `null` si cancela. */
  openProject(): Promise<OpenedFile | null>;
  /**
   * Guarda el proyecto. En escritorio, `save` reutiliza el último archivo
   * elegido; en web siempre descarga una copia. `null` si el usuario cancela.
   */
  saveProject(bytes: Uint8Array, suggestedName: string, mode: SaveMode): Promise<SavedFile | null>;
  /** Guarda un archivo exportado. `null` si el usuario cancela. */
  saveExport(bytes: Uint8Array, suggestedName: string, mime: string): Promise<SavedFile | null>;
  /** El proyecto abierto era válido: "Guardar" escribirá en ese archivo (escritorio). */
  acceptOpenedProject(): Promise<void>;
  /** Olvida el archivo de proyecto actual (al crear un proyecto nuevo). */
  forgetProjectFile(): Promise<void>;
  /** Registra la confirmación de cierre; devuelve falso para cancelar el cierre. */
  onCloseRequested(handler: () => Promise<boolean>): () => void;
  /** Título de la ventana. */
  setTitle(title: string): void;
}

export class PlatformError extends Error {
  readonly code: string;

  constructor(code: string, message?: string) {
    super(message ?? code);
    this.name = 'PlatformError';
    this.code = code;
  }
}
