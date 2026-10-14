import { LIMITS } from '../../core/limits.ts';
import { isValidCIdentifier, toCIdentifier } from '../../core/names.ts';
import type { Diagnostic, ExportContext, OptionField } from '../types.ts';

/** Lectura tolerante de opciones guardadas: cualquier valor inválido usa el predeterminado. */
export function asRecord(raw: unknown): Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {};
}

export function pickEnum<T extends string>(value: unknown, allowed: readonly T[], fallback: T): T {
  return typeof value === 'string' && (allowed as readonly string[]).includes(value)
    ? (value as T)
    : fallback;
}

export function pickBool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function pickInt(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= min && value <= max
    ? value
    : fallback;
}

export function pickString(value: unknown, maxLength: number, fallback: string): string {
  return typeof value === 'string' && value.length <= maxLength ? value : fallback;
}

export type FrameScope = 'all' | 'current';

export const FRAME_SCOPES: readonly FrameScope[] = ['all', 'current'];

export function frameScopeField(): OptionField {
  return {
    kind: 'select',
    key: 'frames',
    labelKey: 'export.option.frames',
    choices: [
      { value: 'all', labelKey: 'export.frames.all' },
      { value: 'current', labelKey: 'export.frames.current' },
    ],
  };
}

/** Índices de fotograma a exportar según el alcance. */
export function selectedFrames(ctx: ExportContext, scope: FrameScope): number[] {
  if (scope === 'current') {
    const i = Math.min(Math.max(0, ctx.currentFrame), ctx.project.frames.length - 1);
    return [i];
  }
  return ctx.project.frames.map((_, i) => i);
}

export function defaultIdentifier(ctx: ExportContext): string {
  return toCIdentifier(ctx.project.name);
}

export function identifierField(): OptionField {
  return {
    kind: 'text',
    key: 'identifier',
    labelKey: 'export.option.identifier',
    maxLength: LIMITS.nameMaxLength,
    hintKey: 'export.hint.identifier',
  };
}

export function validateIdentifier(identifier: string): Diagnostic[] {
  return isValidCIdentifier(identifier)
    ? []
    : [{ severity: 'error', code: 'export.invalidIdentifier', params: { value: identifier } }];
}

/** Rechaza salidas de texto demasiado grandes antes de generarlas. */
export function validateTextSize(estimatedBytes: number): Diagnostic[] {
  return estimatedBytes > LIMITS.exportMaxTextBytes
    ? [
        {
          severity: 'error',
          code: 'export.outputTooLarge',
          params: { size: estimatedBytes, max: LIMITS.exportMaxTextBytes },
        },
      ]
    : [];
}
