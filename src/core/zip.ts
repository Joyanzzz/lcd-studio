import { crc32 } from './crc32.ts';
import { AppError } from './errors.ts';
import { LIMITS, nameLength } from './limits.ts';

/**
 * Escritor ZIP mínimo (método "stored", sin compresión) y validación de
 * nombres de entrada.
 *
 * - Todas las entradas están en la raíz: no se admiten carpetas ni rutas.
 * - La fecha se fija en 1980-01-01 00:00 para que la salida sea determinista.
 * - Los nombres se codifican en UTF-8 (bit 11 de los indicadores).
 */

export interface ZipEntry {
  readonly name: string;
  readonly data: Uint8Array;
}

/**
 * Verdadero si `name` es seguro como entrada ZIP plana: no vacío, sin
 * separadores de ruta, sin `..`, sin unidades (`C:`), sin caracteres de
 * control y sin nombres reservados de Windows. Es la misma comprobación que
 * debería aplicar cualquier lector para evitar "ZIP Slip".
 */
export function isSafeZipEntryName(name: string): boolean {
  if (typeof name !== 'string' || name.length === 0) return false;
  if (nameLength(name) > LIMITS.nameMaxLength + 16) return false;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f]/.test(name)) return false;
  if (/[/\\:*?"<>|]/.test(name)) return false;
  if (name === '.' || name === '..' || name.includes('..')) return false;
  if (/^[\s.]|[\s.]$/.test(name)) return false;
  const stem = name.split('.')[0] ?? '';
  if (/^(con|prn|aux|nul|com[0-9]|lpt[0-9])$/i.test(stem)) return false;
  return true;
}

const DOS_TIME = 0; // 00:00:00
const DOS_DATE = (0 << 9) | (1 << 5) | 1; // 1980-01-01
const MAX_ZIP32 = 0xffffffff;

export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  if (entries.length === 0) throw new AppError('zip.empty');
  if (entries.length > 0xffff) throw new AppError('zip.tooManyEntries');
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of entries) {
    if (!isSafeZipEntryName(entry.name)) {
      throw new AppError('zip.unsafeName', { name: entry.name });
    }
    const key = entry.name.toLowerCase();
    if (seen.has(key)) throw new AppError('zip.duplicateName', { name: entry.name });
    seen.add(key);

    const name = encoder.encode(entry.name);
    const data = entry.data;
    if (data.length > MAX_ZIP32 || offset > MAX_ZIP32) throw new AppError('zip.tooLarge');
    const crc = crc32(data);

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true); // versión necesaria
    lv.setUint16(6, 0x0800, true); // UTF-8
    lv.setUint16(8, 0, true); // stored
    lv.setUint16(10, DOS_TIME, true);
    lv.setUint16(12, DOS_DATE, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, data.length, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);
    locals.push(local, data);

    const central = new Uint8Array(46 + name.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true); // versión creadora (MS-DOS / FAT)
    cv.setUint16(6, 20, true);
    cv.setUint16(8, 0x0800, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, DOS_TIME, true);
    cv.setUint16(14, DOS_DATE, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint16(30, 0, true); // extra
    cv.setUint16(32, 0, true); // comentario
    cv.setUint16(34, 0, true); // disco
    cv.setUint16(36, 0, true); // atributos internos
    cv.setUint32(38, 0, true); // atributos externos
    cv.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);

    offset += local.length + data.length;
  }

  const centralSize = centrals.reduce((sum, c) => sum + c.length, 0);
  if (offset + centralSize + 22 > MAX_ZIP32) throw new AppError('zip.tooLarge');
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, entries.length, true);
  ev.setUint16(10, entries.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const out = new Uint8Array(offset + centralSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, end]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}
