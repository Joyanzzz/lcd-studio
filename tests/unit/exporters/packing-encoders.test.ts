import { GifReader } from 'omggif';
import { inflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32 } from '../../../src/core/crc32.ts';
import { encodeGif, lzwEncode } from '../../../src/exporters/encoders/gif.ts';
import { encodeIndexedPng } from '../../../src/exporters/encoders/png.ts';
import {
  packPages,
  packRowsLsb,
  packRowsMsb,
  pageCount,
  rowStride,
} from '../../../src/exporters/shared/packing.ts';
import { goldenPatterns } from '../../helpers/bitmap.ts';
import { unpackPages, unpackRowsLsb, unpackRowsMsb } from '../../helpers/decode.ts';

const SIZES: [number, number][] = [
  [1, 1],
  [7, 3],
  [8, 8],
  [9, 9],
  [13, 11],
  [16, 2],
  [128, 64],
  [84, 48],
];

describe('empaquetado para pantallas', () => {
  it('filas MSB: píxel aislado y bordes conocidos', () => {
    // 10×2: píxel (0,0) y (9,1).
    const px = new Uint8Array(20);
    px[0] = 1;
    px[19] = 1;
    expect(Array.from(packRowsMsb(px, 10, 2))).toEqual([0x80, 0x00, 0x00, 0x40]);
    expect(Array.from(packRowsLsb(px, 10, 2))).toEqual([0x01, 0x00, 0x00, 0x02]);
  });

  it('páginas verticales: bit 0 arriba y relleno en la última página', () => {
    // 2×10: columna 0 llena, columna 1 solo la fila 9.
    const px = new Uint8Array(20);
    for (let y = 0; y < 10; y++) px[y * 2] = 1;
    px[9 * 2 + 1] = 1;
    expect(Array.from(packPages(px, 2, 10))).toEqual([0xff, 0x00, 0x03, 0x02]);
    expect(pageCount(10)).toBe(2);
    expect(rowStride(9)).toBe(2);
  });

  it('tablero 8×8 en MSB, LSB y páginas', () => {
    const { checker } = goldenPatterns(8, 8);
    expect(Array.from(packRowsMsb(checker, 8, 8))).toEqual([
      0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55,
    ]);
    expect(Array.from(packRowsLsb(checker, 8, 8))).toEqual([
      0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa,
    ]);
    expect(Array.from(packPages(checker, 8, 8))).toEqual([
      0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa, 0x55, 0xaa,
    ]);
  });

  it.each(SIZES)('patrones dorados %i×%i: ida y vuelta exacta', (w, h) => {
    for (const [name, px] of Object.entries(goldenPatterns(w, h))) {
      expect(unpackRowsMsb(packRowsMsb(px, w, h), w, h), `${name} MSB`).toEqual(px);
      expect(unpackRowsLsb(packRowsLsb(px, w, h), w, h), `${name} LSB`).toEqual(px);
      expect(unpackPages(packPages(px, w, h), w, h), `${name} páginas`).toEqual(px);
    }
  });

  it('bitmap vacío y lleno: relleno a cero fuera del lienzo', () => {
    const full = new Uint8Array(9 * 3).fill(1);
    expect(Array.from(packRowsMsb(full, 9, 3))).toEqual([0xff, 0x80, 0xff, 0x80, 0xff, 0x80]);
    expect(Array.from(packRowsLsb(full, 9, 3))).toEqual([0xff, 0x01, 0xff, 0x01, 0xff, 0x01]);
    expect(Array.from(packPages(full, 2, 3))).toEqual([0x07, 0x07]);
    expect(Array.from(packRowsMsb(new Uint8Array(27), 9, 3))).toEqual([0, 0, 0, 0, 0, 0]);
  });
});

describe('PNG indexado', () => {
  function parsePng(png: Uint8Array) {
    expect(Array.from(png.subarray(0, 8))).toEqual([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
    ]);
    const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
    const chunks: Record<string, Uint8Array> = {};
    let p = 8;
    while (p < png.length) {
      const len = view.getUint32(p);
      const type = String.fromCharCode(...png.subarray(p + 4, p + 8));
      const data = png.subarray(p + 8, p + 8 + len);
      expect(view.getUint32(p + 8 + len)).toBe(crc32(png.subarray(p + 4, p + 8 + len)));
      chunks[type] = data;
      p += 12 + len;
    }
    return chunks;
  }

  it('genera chunks válidos y datos que se descomprimen al original', () => {
    const indices = Uint8Array.from([0, 1, 1, 0, 1, 0, 0, 1, 1]);
    const png = encodeIndexedPng(3, 3, indices, [
      [255, 255, 255],
      [0, 0, 0],
    ]);
    const chunks = parsePng(png);
    expect(Object.keys(chunks)).toEqual(['IHDR', 'PLTE', 'IDAT', 'IEND']);
    expect(chunks['IHDR']![8]).toBe(1);
    expect(chunks['IHDR']![9]).toBe(3);
    const raw = new Uint8Array(inflateSync(chunks['IDAT']!));
    expect(Array.from(raw)).toEqual([0, 0b0110_0000, 0, 0b0100_0000, 0, 0b0110_0000]);
  });

  it('usa 2 bits con 3 colores y es determinista', () => {
    const indices = Uint8Array.from([0, 1, 2, 2]);
    const pal: [number, number, number][] = [
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ];
    const a = encodeIndexedPng(4, 1, indices, pal);
    expect(parsePng(a)['IHDR']![8]).toBe(2);
    expect(encodeIndexedPng(4, 1, indices, pal)).toEqual(a);
    const raw = new Uint8Array(inflateSync(parsePng(a)['IDAT']!));
    expect(Array.from(raw)).toEqual([0, 0b00_01_10_10]);
  });

  it('rechaza entradas inválidas', () => {
    expect(() => encodeIndexedPng(0, 1, new Uint8Array(0), [[0, 0, 0]])).toThrow();
    expect(() => encodeIndexedPng(2, 1, new Uint8Array(1), [[0, 0, 0]])).toThrow();
    expect(() => encodeIndexedPng(1, 1, Uint8Array.from([3]), [[0, 0, 0]])).toThrow();
    expect(() => encodeIndexedPng(1, 1, new Uint8Array(1), [])).toThrow();
    expect(() =>
      encodeIndexedPng(1, 1, new Uint8Array(1), new Array(300).fill([0, 0, 0])),
    ).toThrow();
  });
});

describe('GIF y LZW', () => {
  const decode = (gif: Uint8Array) => {
    const reader = new GifReader(gif);
    const frames: number[][] = [];
    for (let i = 0; i < reader.numFrames(); i++) {
      const rgba = new Uint8Array(reader.width * reader.height * 4);
      reader.decodeAndBlitFrameRGBA(i, rgba);
      const px: number[] = [];
      for (let k = 0; k < rgba.length; k += 4) px.push(rgba[k] === 0 ? 1 : 0);
      frames.push(px);
    }
    return { reader, frames };
  };

  it('ida y vuelta con un decodificador independiente (omggif)', () => {
    const w = 37;
    const h = 23;
    const pats = Object.values(goldenPatterns(w, h));
    const gif = encodeGif(
      w,
      h,
      [
        [255, 255, 255],
        [0, 0, 0],
      ],
      pats.map((p) => ({ indices: p, delayCs: 7 })),
      true,
    );
    const { reader, frames } = decode(gif);
    expect(reader.loopCount()).toBe(0);
    expect(reader.frameInfo(0).delay).toBe(7);
    frames.forEach((f, i) => expect(f).toEqual(Array.from(pats[i]!)));
  });

  it('LZW con ruido pseudoaleatorio largo (reinicio del diccionario)', () => {
    const w = 300;
    const h = 200;
    const px = new Uint8Array(w * h);
    let seed = 12345;
    for (let i = 0; i < px.length; i++) {
      seed = (seed * 1103515245 + 12345) >>> 0;
      px[i] = (seed >>> 16) & 1;
    }
    const gif = encodeGif(
      w,
      h,
      [
        [255, 255, 255],
        [0, 0, 0],
      ],
      [{ indices: px, delayCs: 10 }],
      false,
    );
    const { reader, frames } = decode(gif);
    expect(reader.loopCount()).toBeNull();
    expect(frames[0]).toEqual(Array.from(px));
  });

  it('paletas de 3 y 4 colores con código mínimo 2', () => {
    const idx = Uint8Array.from([0, 1, 2, 3, 3, 2, 1, 0]);
    const gif = encodeGif(
      8,
      1,
      [
        [0, 0, 0],
        [80, 80, 80],
        [160, 160, 160],
        [240, 240, 240],
      ],
      [{ indices: idx, delayCs: 2 }],
      true,
    );
    const reader = new GifReader(gif);
    const rgba = new Uint8Array(32);
    reader.decodeAndBlitFrameRGBA(0, rgba);
    expect([rgba[0], rgba[4], rgba[8], rgba[12]]).toEqual([0, 80, 160, 240]);
  });

  it('valida parámetros', () => {
    expect(() => lzwEncode(new Uint8Array(1), 1)).toThrow();
    expect(lzwEncode(new Uint8Array(0), 2).length).toBeGreaterThan(0);
    const pal: [number, number, number][] = [[0, 0, 0]];
    expect(() =>
      encodeGif(0, 1, pal, [{ indices: new Uint8Array(0), delayCs: 2 }], true),
    ).toThrow();
    expect(() => encodeGif(1, 1, pal, [], true)).toThrow();
    expect(() =>
      encodeGif(1, 1, pal, [{ indices: new Uint8Array(2), delayCs: 2 }], true),
    ).toThrow();
    expect(() =>
      encodeGif(1, 1, pal, [{ indices: new Uint8Array(1), delayCs: 1 }], true),
    ).toThrow();
    expect(() =>
      encodeGif(
        1,
        1,
        new Array(300).fill([0, 0, 0]),
        [{ indices: new Uint8Array(1), delayCs: 2 }],
        true,
      ),
    ).toThrow();
  });
});
