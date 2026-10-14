import type { Project } from '../core/project.ts';
import type { DisplayProfile } from '../device-profiles/index.ts';

/**
 * Contrato común de los exportadores. Todos son funciones puras de
 * (proyecto, opciones) → archivos: no usan el DOM, ni React, ni Tauri, y el
 * mismo proyecto produce siempre los mismos bytes.
 */

export type ExportCategory = 'code' | 'data' | 'image';
export type Stability = 'stable' | 'experimental';

export interface ExportFile {
  readonly name: string;
  readonly mime: string;
  readonly data: Uint8Array;
  /** Verdadero si el contenido es texto UTF-8 que se puede previsualizar. */
  readonly text: boolean;
}

export interface CellLocation {
  readonly frame: number;
  readonly row: number;
  readonly col: number;
}

export interface Diagnostic {
  readonly severity: 'error' | 'warning' | 'info';
  readonly code: string;
  readonly params?: Readonly<Record<string, string | number>>;
  /** Celdas implicadas (LCD de caracteres). */
  readonly cells?: readonly CellLocation[];
}

export interface MemoryEstimate {
  /** Bytes de datos generados (tablas). */
  readonly dataBytes: number;
  /** Estimación de flash total incluida la biblioteca, si aplica. */
  readonly flashBytes?: number;
  readonly flashBudget?: number;
  /** Estimación de RAM estática incluida la biblioteca, si aplica. */
  readonly ramBytes?: number;
  readonly ramBudget?: number;
  /** Tamaño aproximado del archivo resultante. */
  readonly outputBytes: number;
}

export interface ExportContext {
  readonly project: Project;
  readonly profile: DisplayProfile;
  /** Fotograma seleccionado en el editor (para "solo el actual"). */
  readonly currentFrame: number;
  /** Versión de la aplicación, que se escribe en la cabecera de los archivos. */
  readonly appVersion: string;
}

export type OptionField =
  | {
      readonly kind: 'select';
      readonly key: string;
      readonly labelKey: string;
      readonly choices: readonly { readonly value: string; readonly labelKey: string }[];
      readonly hintKey?: string;
    }
  | {
      readonly kind: 'boolean';
      readonly key: string;
      readonly labelKey: string;
      /** Opción obligatoria: se muestra marcada y bloqueada con la explicación. */
      readonly locked?: boolean;
      readonly hintKey?: string;
    }
  | {
      readonly kind: 'number';
      readonly key: string;
      readonly labelKey: string;
      readonly min: number;
      readonly max: number;
      readonly step: number;
      readonly hintKey?: string;
    }
  | {
      readonly kind: 'text';
      readonly key: string;
      readonly labelKey: string;
      readonly maxLength: number;
      readonly hintKey?: string;
    };

export interface ExportOutcome {
  readonly diagnostics: readonly Diagnostic[];
  readonly estimate: MemoryEstimate;
  /** Solo presente si no hay diagnósticos de error. */
  readonly files?: readonly ExportFile[];
}

export interface Exporter<O extends object = Record<string, unknown>> {
  readonly id: string;
  readonly labelKey: string;
  readonly descriptionKey: string;
  readonly category: ExportCategory;
  readonly stability: Stability;
  /** Extensión del archivo principal. */
  readonly extension: string;
  /** Orientación del empaquetado de píxeles. */
  readonly orientation: 'rows' | 'vertical-pages' | 'cells' | 'image' | 'text';
  /** Orden de bits dentro de cada byte. */
  readonly bitOrder: 'msb-first' | 'lsb-first' | 'cgram-rows' | 'none';
  /** Claves de traducción de las restricciones que declara el exportador. */
  readonly constraintKeys: readonly string[];
  supports(profile: DisplayProfile): boolean;
  /** Opciones por omisión para el proyecto. */
  defaults(ctx: ExportContext): O;
  /** Convierte opciones guardadas (posiblemente obsoletas) en opciones válidas. */
  normalize(raw: unknown, ctx: ExportContext): O;
  /** Campos visibles: solo los que tienen efecto con este perfil y opciones. */
  fields(ctx: ExportContext, options: O): readonly OptionField[];
  validate(ctx: ExportContext, options: O): readonly Diagnostic[];
  estimate(ctx: ExportContext, options: O): MemoryEstimate;
  /** Genera los archivos. Solo se llama si `validate` no devolvió errores. */
  run(ctx: ExportContext, options: O): readonly ExportFile[];
}

export function hasErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}
