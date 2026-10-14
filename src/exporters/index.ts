import { overLimitFrames } from '../core/constraints.ts';
import { isAppError } from '../core/errors.ts';
import type { DisplayProfile } from '../device-profiles/index.ts';
import { adafruitGfxExporter } from './adafruit-gfx.ts';
import { asciiExporter } from './ascii.ts';
import { binaryExporter } from './binary.ts';
import { customCharsExporter } from './custom-chars.ts';
import { gifExporter } from './gif.ts';
import { liquidCrystalI2cExporter } from './liquidcrystal-i2c.ts';
import { liquidCrystalExporter } from './liquidcrystal.ts';
import { max7219ArduinoExporter, max7219DataExporter } from './max7219.ts';
import { pngExporter } from './png.ts';
import { spriteSheetExporter } from './sprite-sheet.ts';
import {
  hasErrors,
  type Diagnostic,
  type ExportContext,
  type Exporter,
  type ExportOutcome,
} from './types.ts';
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
  max7219ArduinoExporter,
  customCharsExporter,
  max7219DataExporter,
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
 * Proyecto de caracteres en reparación (fotogramas con más de 8 patrones):
 * el código y los datos CGRAM ya se bloquean con las celdas exactas; las
 * exportaciones visuales siguen disponibles, pero avisan de que no certifican
 * que el resultado funcione en el dispositivo.
 */
function withRepairNotice(
  exporter: Exporter<object>,
  ctx: ExportContext,
  diagnostics: readonly Diagnostic[],
): readonly Diagnostic[] {
  if (ctx.profile.kind !== 'character' || diagnostics.some((d) => d.code === 'cgram.overflow')) {
    return diagnostics;
  }
  const frames = overLimitFrames(ctx.project);
  if (frames.length === 0) return diagnostics;
  return [
    ...diagnostics,
    {
      severity: 'warning',
      code: 'export.visualNotCertified',
      params: { frames: frames.length, category: exporter.category },
    },
  ];
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
    const diagnostics = withRepairNotice(exporter, ctx, exporter.validate(ctx, options));
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
      diagnostics: withRepairNotice(exporter, ctx, exporter.validate(ctx, options)),
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
