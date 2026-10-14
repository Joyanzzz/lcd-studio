import { inflateRawSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32 } from '../../../src/core/crc32.ts';
import {
  isValidCIdentifier,
  isValidProjectName,
  safeFileName,
  sanitizeFileBaseName,
  sanitizeProjectName,
  toCIdentifier,
  truncateCodePoints,
} from '../../../src/core/names.ts';
import { createZip, isSafeZipEntryName } from '../../../src/core/zip.ts';

/** Lector ZIP mínimo para verificar la estructura generada. */
function readZip(zip: Uint8Array): { name: string; data: Uint8Array; crc: number }[] {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const eocd = zip.length - 22;
  expect(view.getUint32(eocd, true)).toBe(0x06054b50);
  const count = view.getUint16(eocd + 10, true);
  const cdSize = view.getUint32(eocd + 12, true);
  const cdOffset = view.getUint32(eocd + 16, true);
  expect(cdOffset + cdSize).toBe(eocd);
  const out = [];
  let p = cdOffset;
  for (let i = 0; i < count; i++) {
    expect(view.getUint32(p, true)).toBe(0x02014b50);
    const method = view.getUint16(p + 10, true);
    const crc = view.getUint32(p + 16, true);
    const size = view.getUint32(p + 20, true);
    const nameLen = view.getUint16(p + 28, true);
    const local = view.getUint32(p + 42, true);
    const name = new TextDecoder().decode(zip.subarray(p + 46, p + 46 + nameLen));
    expect(view.getUint32(local, true)).toBe(0x04034b50);
    const localNameLen = view.getUint16(local + 26, true);
    const extraLen = view.getUint16(local + 28, true);
    const start = local + 30 + localNameLen + extraLen;
    const raw = zip.subarray(start, start + size);
    const data = method === 0 ? raw : new Uint8Array(inflateRawSync(raw));
    out.push({ name, data, crc });
    p += 46 + nameLen;
  }
  return out;
}

describe('ZIP', () => {
  it('genera un ZIP válido, plano y con CRC correctos', () => {
    const files = [
      { name: 'main.c', data: new TextEncoder().encode('int main(void){return 0;}\n') },
      { name: 'lcd.h', data: new TextEncoder().encode('#pragma once\n') },
      { name: 'vacío.txt', data: new Uint8Array(0) },
    ];
    const zip = createZip(files);
    const entries = readZip(zip);
    expect(entries.map((e) => e.name)).toEqual(['main.c', 'lcd.h', 'vacío.txt']);
    for (let i = 0; i < files.length; i++) {
      expect(entries[i]!.data).toEqual(files[i]!.data);
      expect(entries[i]!.crc).toBe(crc32(files[i]!.data));
    }
  });

  it('es determinista', () => {
    const files = [{ name: 'a.txt', data: Uint8Array.from([1, 2, 3]) }];
    expect(createZip(files)).toEqual(createZip(files));
  });

  it.each(['', '../a', 'a/b', 'a\\b', 'C:x', '/abs', 'con.txt', 'a\u0000b', ' a', 'a.', '..'])(
    'rechaza el nombre inseguro %j',
    (name) => {
      expect(isSafeZipEntryName(name)).toBe(false);
      expect(() => createZip([{ name, data: new Uint8Array(1) }])).toThrow();
    },
  );

  it('rechaza duplicados (sin distinguir mayúsculas) y ZIP vacíos', () => {
    expect(() =>
      createZip([
        { name: 'A.txt', data: new Uint8Array(0) },
        { name: 'a.txt', data: new Uint8Array(0) },
      ]),
    ).toThrow(/duplicateName/);
    expect(() => createZip([])).toThrow(/empty/);
  });
});

describe('nombres', () => {
  it('sanea nombres de proyecto', () => {
    expect(sanitizeProjectName('  Mi   proyecto\n ')).toBe('Mi proyecto');
    expect(sanitizeProjectName('\u0000\u0007')).toBe('proyecto');
    expect(Array.from(sanitizeProjectName('x'.repeat(100))).length).toBe(64);
    expect(isValidProjectName('Hola')).toBe(true);
    expect(isValidProjectName(' Hola')).toBe(false);
    expect(isValidProjectName('')).toBe(false);
    expect(isValidProjectName(3)).toBe(false);
  });

  it('no parte pares sustitutos al truncar', () => {
    expect(truncateCodePoints('😀😀😀', 2)).toBe('😀😀');
  });

  it('sanea nombres de archivo para todos los sistemas', () => {
    expect(sanitizeFileBaseName('../../etc/passwd')).toBe('_.._etc_passwd');
    expect(sanitizeFileBaseName('a:b*c?"<>|')).toBe('a_b_c_____');
    expect(sanitizeFileBaseName('CON')).toBe('_CON');
    expect(sanitizeFileBaseName('nul.txt')).toBe('_nul.txt');
    expect(sanitizeFileBaseName('...')).toBe('lcd-studio');
    expect(sanitizeFileBaseName('fin. ')).toBe('fin');
    expect(sanitizeFileBaseName('a\u0001b')).toBe('ab');
    expect(Array.from(sanitizeFileBaseName('é'.repeat(80))).length).toBe(64);
    expect(safeFileName('proyecto', '.lcdstudio.json')).toBe('proyecto.lcdstudio.json');
    expect(() => safeFileName('x', 'png')).toThrow();
    expect(() => safeFileName('x', '.p/ng')).toThrow();
  });

  it('genera identificadores C seguros', () => {
    expect(toCIdentifier('Mi animación')).toBe('Mi_animacion');
    expect(toCIdentifier('3 caras')).toBe('img_3_caras');
    expect(toCIdentifier('loop')).toBe('loop_');
    expect(toCIdentifier('int')).toBe('int_');
    expect(toCIdentifier('___')).toBe('imagen');
    expect(toCIdentifier('😀')).toBe('imagen');
    expect(toCIdentifier('a'.repeat(100)).length).toBeLessThanOrEqual(64);
    for (const name of ['Mi animación', '3 caras', 'loop', 'int', '___', 'x'.repeat(90), 'ñandú']) {
      expect(isValidCIdentifier(toCIdentifier(name))).toBe(true);
    }
    expect(isValidCIdentifier('_x')).toBe(false);
    expect(isValidCIdentifier('while')).toBe(false);
  });
});
