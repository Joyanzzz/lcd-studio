import { LIMITS } from '../core/limits.ts';
import { sanitizeFileBaseName } from '../core/names.ts';
import { sourceHeader, textFile } from './shared/c-source.ts';
import { buildPlan, cgramDiagnostics, characterProfile } from './shared/char-sketch.ts';
import {
  asRecord,
  defaultIdentifier,
  FRAME_SCOPES,
  identifierField,
  pickEnum,
  pickString,
  validateIdentifier,
  type FrameScope,
} from './shared/options.ts';
import type { Diagnostic, Exporter } from './types.ts';

/**
 * Caracteres personalizados 5×8 (`createChar`) como tablas C, sin código de
 * pantalla. Incluye, por fotograma, qué glifo va en cada ranura y el mapa de
 * celdas, para poder montar la animación con cualquier biblioteca.
 */

export interface CustomCharsOptions {
  readonly frames: FrameScope;
  readonly identifier: string;
}

const binary5 = (v: number) => `0b${v.toString(2).padStart(5, '0')}`;

export const customCharsExporter: Exporter<CustomCharsOptions> = {
  id: 'custom-chars',
  labelKey: 'exporter.custom-chars',
  descriptionKey: 'exporter.custom-chars.description',
  category: 'data',
  contents: ['frame', 'animation'],
  stability: 'stable',
  extension: '.h',
  orientation: 'cells',
  bitOrder: 'cgram-rows',
  constraintKeys: ['constraint.characterOnly', 'constraint.cgram8', 'constraint.dataOnly'],
  supports: (profile) => profile.kind === 'character',

  defaults(ctx) {
    return { frames: 'current', identifier: defaultIdentifier(ctx) };
  },

  normalize(raw, ctx) {
    const d = this.defaults(ctx);
    const r = asRecord(raw);
    return {
      frames: pickEnum(r['frames'], FRAME_SCOPES, d.frames),
      identifier: pickString(r['identifier'], LIMITS.nameMaxLength * 2, d.identifier),
    };
  },

  fields() {
    return [identifierField()];
  },

  estimate(ctx, options) {
    const plan = buildPlan(ctx, options.frames);
    const data = plan.glyphPool.length * 8;
    return { dataBytes: data, outputBytes: data * 10 + plan.frames.length * 400 + 2048 };
  },

  validate(ctx, options) {
    const plan = buildPlan(ctx, options.frames);
    const out: Diagnostic[] = [
      ...validateIdentifier(options.identifier),
      ...cgramDiagnostics(ctx, plan),
    ];
    if (plan.overflow.length === 0 && plan.glyphPool.length === 0) {
      out.push({ severity: 'info', code: 'cgram.noCustomChars' });
    }
    return out;
  },

  run(ctx, options) {
    const plan = buildPlan(ctx, options.frames);
    if (plan.overflow.length > 0) throw new Error('Desbordamiento CGRAM');
    const profile = characterProfile(ctx);
    const id = options.identifier;
    const ID = id.toUpperCase();
    const glyphs = plan.glyphPool
      .map(
        (g, i) =>
          `static const uint8_t ${id}_char_${i}[8] = {\n${Array.from(g)
            .map((row) => `  ${binary5(row)}`)
            .join(',\n')}\n};\n`,
      )
      .join('\n');
    const frameNotes = plan.frames
      .map((f) => {
        const slots = Array.from(f.slots)
          .map((g, s) => (g >= 0 ? `ranura ${s} = ${id}_char_${g}` : null))
          .filter((x): x is string => x !== null);
        const rows: string[] = [];
        for (let r = 0; r < profile.rows; r++) {
          const codes = Array.from(
            f.cells.subarray(r * profile.columns, (r + 1) * profile.columns),
          );
          rows.push(
            ` *   fila ${r}: ${codes
              .map((c) =>
                c < 8 ? String(c) : c === 0x20 ? '.' : `0x${c.toString(16).toUpperCase()}`,
              )
              .join(' ')}`,
          );
        }
        return ` * Fotograma ${f.frameIndex + 1}: ${slots.length > 0 ? slots.join(', ') : 'sin caracteres propios'}\n${rows.join('\n')}`;
      })
      .join('\n');
    const content = `${sourceHeader(
      ctx,
      'Caracteres personalizados 5x8 para HD44780 (CGRAM)',
      plan.frames.length,
      [
        'Cada carácter: 8 filas de 5 bits, bit 4 = columna izquierda. Úsalos con createChar(ranura, datos).',
        'Mapa de celdas: 0-7 = ranura CGRAM, "." = espacio (0x20), 0xNN = carácter ROM.',
      ],
    )}
/*
${frameNotes}
 */

#ifndef ${ID}_CHARS_H
#define ${ID}_CHARS_H

#include <stdint.h>

#define ${ID}_CHAR_COUNT ${plan.glyphPool.length}u

${glyphs || '/* Los fotogramas seleccionados no necesitan caracteres propios. */\n'}
#endif
`;
    return [textFile(`${sanitizeFileBaseName(id)}_chars.h`, content, 'text/x-c')];
  },
};
