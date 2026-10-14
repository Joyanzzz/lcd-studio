import { describe, expect, it } from 'vitest';
import { base64Length, decodeBase64, encodeBase64 } from '../../../src/core/base64.ts';
import { packBits, packedLength, unpackBits } from '../../../src/core/bitpack.ts';
import { AppError } from '../../../src/core/errors.ts';
import { crc32, crc32Update } from '../../../src/core/crc32.ts';

describe('empaquetado de bits (LSB primero)', () => {
  it('coloca el píxel i en el bit i&7 del byte i>>3', () => {
    const px = new Uint8Array(10);
    px[0] = 1;
    px[7] = 1;
    px[9] = 1;
    expect(Array.from(packBits(px))).toEqual([0b1000_0001, 0b0000_0010]);
  });

  it('ida y vuelta con longitudes no múltiplo de 8', () => {
    for (const n of [0, 1, 7, 8, 9, 15, 16, 17, 80 * 16, 511 * 3]) {
      const px = new Uint8Array(n);
      for (let i = 0; i < n; i++) px[i] = (i * 7 + (i >> 3)) % 3 === 0 ? 1 : 0;
      const packed = packBits(px);
      expect(packed.length).toBe(packedLength(n));
      expect(Array.from(unpackBits(packed, n))).toEqual(Array.from(px));
    }
  });

  it('normaliza valores distintos de 0 y 1', () => {
    expect(Array.from(packBits(Uint8Array.from([255, 0, 2])))).toEqual([0b101]);
  });

  it('rechaza longitudes incorrectas y relleno distinto de cero', () => {
    expect(() => unpackBits(new Uint8Array(1), 9)).toThrow(AppError);
    expect(() => unpackBits(new Uint8Array(3), 9)).toThrow(AppError);
    expect(() => unpackBits(Uint8Array.from([0, 0b10]), 9)).toThrow(/nonZeroPadding/);
    expect(() => packedLength(-1)).toThrow(AppError);
    expect(() => packedLength(NaN)).toThrow(AppError);
  });

  it('empaqueta mapas vacíos y llenos', () => {
    expect(Array.from(packBits(new Uint8Array(16)))).toEqual([0, 0]);
    expect(Array.from(packBits(new Uint8Array(12).fill(1)))).toEqual([255, 0x0f]);
  });
});

describe('base64 estricta', () => {
  const vectors: [string, string][] = [
    ['', ''],
    ['f', 'Zg=='],
    ['fo', 'Zm8='],
    ['foo', 'Zm9v'],
    ['foob', 'Zm9vYg=='],
    ['fooba', 'Zm9vYmE='],
    ['foobar', 'Zm9vYmFy'],
  ];

  it.each(vectors)('codifica y decodifica %j (RFC 4648)', (plain, encoded) => {
    const bytes = new TextEncoder().encode(plain);
    expect(encodeBase64(bytes)).toBe(encoded);
    expect(new TextDecoder().decode(decodeBase64(encoded))).toBe(plain);
    expect(base64Length(bytes.length)).toBe(encoded.length);
  });

  it('coincide con Buffer para datos binarios largos', () => {
    const bytes = new Uint8Array(70_000);
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + (i >> 5)) & 255;
    const encoded = encodeBase64(bytes);
    expect(encoded).toBe(Buffer.from(bytes).toString('base64'));
    expect(decodeBase64(encoded)).toEqual(bytes);
  });

  it.each([
    ['Zg=', 'length'],
    ['Zm9v YmFy', 'length'],
    ['Zm9vYmF ', 'character'],
    ['Zm=v', 'padding'],
    ['=Zm9', 'padding'],
    ['Zm9vYg==Zm9v', 'padding'],
    ['Zh==', 'nonCanonical'],
    ['Zm9=', 'nonCanonical'],
    ['Zm9vY*==', 'character'],
    ['Zm9vYé==', 'character'],
  ])('rechaza %j (%s)', (text, code) => {
    expect(() => decodeBase64(text)).toThrow(new RegExp(code));
  });
});

describe('CRC-32', () => {
  it('coincide con vectores conocidos', () => {
    expect(crc32(new Uint8Array(0))).toBe(0);
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
    expect(crc32(new TextEncoder().encode('The quick brown fox jumps over the lazy dog'))).toBe(
      0x414fa339,
    );
  });

  it('se puede calcular por partes', () => {
    const a = new TextEncoder().encode('12345');
    const b = new TextEncoder().encode('6789');
    expect((crc32Update(crc32Update(0xffffffff, a), b) ^ 0xffffffff) >>> 0).toBe(0xcbf43926);
  });
});
