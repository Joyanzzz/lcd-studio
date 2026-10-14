import { isAppError } from '../core/errors.ts';
import type { DisplayProfile } from '../device-profiles/index.ts';
import { adafruitGfxExporter } from './adafruit-gfx.ts';
import { asciiExporter } from './ascii.ts';
import { binaryExporter } from './binary.ts';
import { customCharsExporter } from './custom-chars.ts';
import { gifExporter } from './gif.ts';
import { liquidCrystalI2cExporter } from './liquidcrystal-i2c.ts';
import { liquidCrystalExporter } from './liquidcrystal.ts';
import { pngExporter } from './png.ts';
import { spriteSheetExporter } from './sprite-sheet.ts';
import { hasErrors, type ExportContext, type Exporter, type ExportOutcome } from './types.ts';
import { u8g2XbmExporter } from './u8g2-xbm.ts';
import { verticalPagesExporter } from './vertical-pages.ts';
import { xc8Exporter } from './xc8.ts';

export type {
  Diagnostic,
  ExportContext,
  Exporter,
  ExportFile,
  ExportOutcome,
  OptionField,
} from './types.ts';

/** Registro único de exportadores. Web y escritorio usan exactamente esta lista. */
export const EXPORTERS: readonly Exporter<object>[] = Object.freeze([
  adafruitGfxExporter,
  u8g2XbmExporter,
  verticalPagesExporter,
  liquidCrystalExporter,
  liquidCrystalI2cExporter,
  xc8Exporter,
  customCharsExporter,
  binaryExporter,
  asciiExporter,
  pngExporter,
  spriteSheetExporter,
  gifExporter,
] as unknown as Exporter<object>[]);

export function getExporter(id: string): Exporter<object> | undefined {
  return EXPORTERS.find((e) => e.id === id);
}

/** Exportadores aplicables al perfil; los experimentales solo si están activados. */
export function exportersFor(profile: DisplayProfile, experimental: boolean): Exporter<object>[] {
  return EXPORTERS.filter((e) => e.supports(profile) && (experimental || e.stability === 'stable'));
}

/**
 * Ejecuta un exportador: normaliza opciones, valida y, si no hay errores,
 * genera los archivos. Nunca genera archivos con diagnósticos de error.
 */
export function runExport(
  exporter: Exporter<object>,
  ctx: ExportContext,
  rawOptions: unknown,
): ExportOutcome {
  if (!exporter.supports(ctx.profile)) {
    return {
      diagnostics: [
        {
          severity: 'error',
          code: 'export.unsupportedProfile',
          params: { profile: ctx.profile.id },
        },
      ],
      estimate: { dataBytes: 0, outputBytes: 0 },
    };
  }
  try {
    const options = exporter.normalize(rawOptions, ctx);
    const diagnostics = exporter.validate(ctx, options);
    const estimate = exporter.estimate(ctx, options);
    if (hasErrors(diagnostics)) return { diagnostics, estimate };
    return { diagnostics, estimate, files: exporter.run(ctx, options) };
  } catch (error) {
    return {
      diagnostics: [
        isAppError(error)
          ? { severity: 'error', code: error.code, params: { ...error.params } }
          : { severity: 'error', code: 'export.internal' },
      ],
      estimate: { dataBytes: 0, outputBytes: 0 },
    };
  }
}

/** Solo validación y estimación (para mostrar avisos antes de exportar). */
export function inspectExport(
  exporter: Exporter<object>,
  ctx: ExportContext,
  rawOptions: unknown,
): Omit<ExportOutcome, 'files'> & { options: object } {
  const options = exporter.normalize(rawOptions, ctx);
  try {
    return {
      options,
      diagnostics: exporter.validate(ctx, options),
      estimate: exporter.estimate(ctx, options),
    };
  } catch (error) {
    return {
      options,
      diagnostics: [
        isAppError(error)
          ? { severity: 'error', code: error.code, params: { ...error.params } }
          : { severity: 'error', code: 'export.internal' },
      ],
      estimate: { dataBytes: 0, outputBytes: 0 },
    };
  }
}
