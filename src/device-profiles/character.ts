import type { CharacterProfile, RomCharsetId } from './types.ts';

/**
 * Perfiles de LCD de caracteres.
 *
 * Solo se incluyen geometrías cuyo mapa DDRAM está documentado para un único
 * controlador HD44780 en modo de 2 líneas (línea 1: 0x00–0x27, línea 2:
 * 0x40–0x67). Las pantallas de 4 filas reparten cada línea lógica en dos
 * filas físicas: la fila 3 continúa la línea 1 y la fila 4 continúa la línea 2.
 *
 * Referencias: hoja de datos Hitachi HD44780U (ADE-207-272), tabla
 * "Relationship Between DDRAM Address and Display Position"; las direcciones
 * 0x14/0x54 (20×4) y 0x10/0x50 (16×4) se derivan de esa misma regla.
 */

const ROM_SETS: readonly RomCharsetId[] = ['none', 'hd44780-a00'];
const SOURCE = 'Hitachi HD44780U (ADE-207-272), modo 2 líneas';

function hd44780(
  columns: number,
  rows: number,
  ddramRowAddresses: readonly number[],
): CharacterProfile {
  return Object.freeze({
    kind: 'character',
    content: 'raster',
    id: `hd44780-${columns}x${rows}`,
    labelKey: `profile.hd44780-${columns}x${rows}`,
    controller: 'HD44780',
    columns,
    rows,
    cellWidth: 5,
    cellHeight: 8,
    cgramSlots: 8,
    ddramRowAddresses: Object.freeze([...ddramRowAddresses]),
    romCharsets: ROM_SETS,
    width: columns * 5,
    height: rows * 8,
    ddramSource: SOURCE,
  });
}

export const CHARACTER_PROFILES: readonly CharacterProfile[] = Object.freeze([
  hd44780(16, 2, [0x00, 0x40]),
  hd44780(20, 2, [0x00, 0x40]),
  hd44780(16, 4, [0x00, 0x40, 0x10, 0x50]),
  hd44780(20, 4, [0x00, 0x40, 0x14, 0x54]),
]);

/** Rangos válidos de DDRAM del HD44780 en modo de 2 líneas. */
export const HD44780_DDRAM_LINES: readonly (readonly [number, number])[] = Object.freeze([
  [0x00, 0x27],
  [0x40, 0x67],
]);
