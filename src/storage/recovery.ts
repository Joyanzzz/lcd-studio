import type { Issue, Result } from '../core/errors.ts';
import type { Project } from '../core/project.ts';
import type { RecoverySnapshot } from './recovery-store.ts';

export type RecoveryOutcome =
  | { readonly kind: 'none' }
  | {
      readonly kind: 'recovered';
      readonly project: Project;
      readonly source: 'current' | 'previous';
      readonly unsavedToFile: boolean;
      readonly warnings: readonly Issue[];
    };

/**
 * Elige qué copia restaurar: la más reciente si es válida; si no, la anterior.
 * Una copia dañada nunca se abre parcialmente.
 */
export async function chooseRecovery(
  snapshot: RecoverySnapshot,
  parse: (bytes: Uint8Array) => Result<Project> | Promise<Result<Project>>,
): Promise<RecoveryOutcome> {
  for (const source of ['current', 'previous'] as const) {
    const record = snapshot[source];
    if (!record) continue;
    const result = await parse(record.bytes);
    if (result.ok) {
      return {
        kind: 'recovered',
        project: result.value,
        source,
        unsavedToFile: record.unsavedToFile,
        warnings: result.warnings,
      };
    }
  }
  return { kind: 'none' };
}
