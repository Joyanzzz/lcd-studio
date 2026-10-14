import type { ExportContext, ExportFile } from '../types.ts';

/** Utilidades para generar código C/C++ legible y determinista. */

export function hex8(value: number): string {
  if (!Number.isInteger(value) || value < 0 || value > 0xff) {
    throw new Error(`Byte fuera de rango: ${value}`);
  }
  return `0x${value.toString(16).toUpperCase().padStart(2, '0')}`;
}

/** Lista de bytes en líneas de `perLine` valores con la sangría dada. */
export function byteLines(bytes: ArrayLike<number>, indent: string, perLine = 16): string {
  const lines: string[] = [];
  for (let i = 0; i < bytes.length; i += perLine) {
    const chunk: string[] = [];
    for (let k = i; k < Math.min(bytes.length, i + perLine); k++) chunk.push(hex8(bytes[k]!));
    lines.push(indent + chunk.join(', '));
  }
  return lines.join(',\n');
}

/** Lista de enteros decimales (duraciones, índices) en líneas. */
export function numberLines(values: readonly number[], indent: string, perLine = 12): string {
  const lines: string[] = [];
  for (let i = 0; i < values.length; i += perLine) {
    lines.push(
      indent +
        values
          .slice(i, i + perLine)
          .map((v) => String(v))
          .join(', '),
    );
  }
  return lines.join(',\n');
}

/**
 * Texto del usuario seguro dentro de un comentario de bloque: sin saltos de
 * línea, sin caracteres de control y sin cierre de comentario.
 */
export function commentSafe(text: string): string {
  return text
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, ' ')
    .replace(/\*\//g, '* /')
    .replace(/\/\*/g, '/ *')
    .replace(/\?\?/g, '? ?');
}

const LOOP_LABEL: Readonly<Record<string, string>> = {
  loop: 'bucle',
  pingpong: 'ida y vuelta',
  once: 'una vez',
};

/** Cabecera común de los archivos de código. */
export function sourceHeader(
  ctx: ExportContext,
  title: string,
  frameCount: number,
  extra: readonly string[] = [],
): string {
  const p = ctx.project;
  const lines = [
    `${title}`,
    `Generado por LCD Studio ${commentSafe(ctx.appVersion)}.`,
    `Proyecto: ${commentSafe(p.name)}`,
    `Pantalla: ${p.profileId} (${p.width}x${p.height} px)`,
    `Fotogramas: ${frameCount} - reproducción: ${LOOP_LABEL[p.loopMode] ?? p.loopMode}`,
    ...extra.map(commentSafe),
  ];
  return `/*\n${lines.map((l) => ` * ${l}`.trimEnd()).join('\n')}\n */\n`;
}

export function textFile(name: string, content: string, mime = 'text/plain'): ExportFile {
  const normalized = content.replace(/\r\n?/g, '\n');
  return {
    name,
    mime: `${mime};charset=utf-8`,
    data: new TextEncoder().encode(normalized.endsWith('\n') ? normalized : `${normalized}\n`),
    text: true,
  };
}
