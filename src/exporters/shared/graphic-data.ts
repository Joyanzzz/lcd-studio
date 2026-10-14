import { byteLines, numberLines } from './c-source.ts';

/**
 * Tablas C de una animación gráfica: un arreglo por fotograma (cada uno por
 * debajo del límite de objeto de avr-gcc), una tabla de punteros y una tabla
 * de duraciones. Los índices y tamaños usan `uint16_t`.
 */
export interface GraphicTablesOptions {
  /** Prefijo de los nombres (identificador C). */
  readonly prefix: string;
  /** Atributo de almacenamiento: `PROGMEM`, `U8X8_PROGMEM` o vacío (RAM). */
  readonly storage: '' | 'PROGMEM' | 'U8X8_PROGMEM';
  readonly frames: readonly Uint8Array[];
  readonly durations: readonly number[];
  /** Comentario breve por fotograma (número original). */
  readonly frameLabels: readonly string[];
}

export function graphicTables(o: GraphicTablesOptions): string {
  const attr = o.storage ? ` ${o.storage}` : '';
  const parts: string[] = [];
  o.frames.forEach((bytes, i) => {
    parts.push(
      `// ${o.frameLabels[i]}\nstatic const uint8_t ${o.prefix}_frame_${i}[${bytes.length}]${attr} = {\n${byteLines(bytes, '  ')}\n};\n`,
    );
  });
  const names = o.frames.map((_, i) => `${o.prefix}_frame_${i}`);
  parts.push(
    `static const uint8_t *const ${o.prefix}_frames[${o.frames.length}]${attr} = {\n${names
      .map((n) => `  ${n}`)
      .join(',\n')}\n};\n`,
  );
  parts.push(
    `static const uint16_t ${o.prefix}_durations_ms[${o.durations.length}]${attr} = {\n${numberLines(o.durations, '  ')}\n};\n`,
  );
  return parts.join('\n');
}

/** Bytes de tablas: datos + punteros (2 B) + duraciones (2 B) por fotograma en AVR. */
export function graphicTableBytes(bytesPerFrame: number, frameCount: number): number {
  return bytesPerFrame * frameCount + 4 * frameCount;
}

/** Estimación del tamaño del texto generado (≈ 6 caracteres por byte). */
export function estimateTextBytes(dataBytes: number, frameCount: number): number {
  return dataBytes * 6 + frameCount * 120 + 4096;
}
