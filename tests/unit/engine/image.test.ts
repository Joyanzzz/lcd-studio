import { GifWriter } from 'omggif';
import { deflateSync } from 'node:zlib';
import { describe, expect, it } from 'vitest';
import { crc32 } from '../../../src/core/crc32.ts';
import { bayerMatrix, dither } from '../../../src/engine/image/dither.ts';
import { decodeGif, gifDelayToMs } from '../../../src/engine/image/gif-decode.ts';
import { applyLut, autoLevels, histogram, levelsLut } from '../../../src/engine/image/levels.ts';
import {
  DEFAULT_IMAGE_PARAMS,
  sanitizeImageParams,
  type ImageParams,
} from '../../../src/engine/image/params.ts';
import { ImagePipeline } from '../../../src/engine/image/pipeline.ts';
import {
  compositeOnBackground,
  computePlacement,
  integralImage,
  resampleToTarget,
} from '../../../src/engine/image/resample.ts';
import { detectFormat, readImageHeader } from '../../../src/engine/image/sniff.ts';
import {
  lumaOf,
  rgbaToGraySource,
  workingSize,
  type GraySource,
} from '../../../src/engine/image/source.ts';

const params = (patch: Partial<ImageParams> = {}): ImageParams => ({
  ...DEFAULT_IMAGE_PARAMS,
  ...patch,
});

function grayFrom(width: number, height: number, values: number[], alpha = 255): GraySource {
  return {
    width,
    height,
    luma: Uint8Array.from(values),
    alpha: new Uint8Array(width * height).fill(alpha),
    durationMs: 200,
  };
}

/** PNG mínimo válido (escala de grises 8 bits). */
function makePng(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Uint8Array) => {
    const out = new Uint8Array(12 + data.length);
    const view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(type), 4);
    out.set(data, 8);
    view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
    return out;
  };
  const ihdr = new Uint8Array(13);
  const v = new DataView(ihdr.buffer);
  v.setUint32(0, width);
  v.setUint32(4, height);
  ihdr[8] = 8;
  ihdr[9] = 0;
  const raw = new Uint8Array((width + 1) * height);
  const idat = new Uint8Array(deflateSync(raw));
  const parts = [
    Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', idat),
    chunk('IEND', new Uint8Array(0)),
  ];
  const total = parts.reduce((s, p) => s + p.length, 0);
  const png = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    png.set(p, o);
    o += p.length;
  }
  return png;
}

describe('detección de formato', () => {
  it('reconoce PNG y lee sus dimensiones', () => {
    expect(readImageHeader(makePng(30, 20))).toEqual({
      format: 'png',
      width: 30,
      height: 20,
      animatedWebp: false,
    });
  });

  it('reconoce JPEG buscando el marcador SOF', () => {
    const jpeg = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xe0, 0x00, 0x04, 0x00, 0x00, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x00, 0x30,
      0x00, 0x40, 0x03, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
    ]);
    expect(readImageHeader(jpeg)).toMatchObject({ format: 'jpeg', width: 64, height: 48 });
  });

  it('reconoce los tres tipos de WebP', () => {
    const riff = (chunk: string, body: number[]) => {
      const b = new Uint8Array(40);
      b.set(new TextEncoder().encode('RIFF'), 0);
      b.set(new TextEncoder().encode('WEBP'), 8);
      b.set(new TextEncoder().encode(chunk), 12);
      b.set(body, 20);
      return b;
    };
    // VP8X: animado, 300×200 (guardado como valor-1 en 24 bits).
    const vp8x = riff('VP8X', [0x02, 0, 0, 0, 0x2b, 0x01, 0x00, 0xc7, 0x00, 0x00]);
    expect(readImageHeader(vp8x)).toEqual({
      format: 'webp',
      width: 300,
      height: 200,
      animatedWebp: true,
    });
    // VP8L: 14 bits de ancho-1 y alto-1.
    const w = 99;
    const h = 49;
    const bits = w | (h << 14);
    const vp8l = riff('VP8L', [0, 0, 0, 0, 0, 0, 0, 0, 0x2f - 0x2f + 0x2f]);
    vp8l[20] = 0x2f;
    vp8l[21] = bits & 255;
    vp8l[22] = (bits >> 8) & 255;
    vp8l[23] = (bits >> 16) & 255;
    vp8l[24] = (bits >> 24) & 255;
    expect(readImageHeader(vp8l)).toMatchObject({ width: 100, height: 50 });
    const vp8 = riff('VP8 ', []);
    vp8.set([0x9d, 0x01, 0x2a, 0x40, 0x01, 0xf0, 0x00], 23);
    expect(readImageHeader(vp8)).toMatchObject({ width: 320, height: 240 });
  });

  it('reconoce GIF por su firma y no por la extensión', () => {
    expect(detectFormat(new TextEncoder().encode('GIF89a\x10\x00\x08\x00'))).toBe('gif');
    expect(detectFormat(new TextEncoder().encode('<svg></svg>'))).toBeUndefined();
    expect(detectFormat(new Uint8Array(0))).toBeUndefined();
  });

  it('rechaza imágenes demasiado grandes antes de decodificarlas', () => {
    expect(() => readImageHeader(makePng(5000, 5000))).toThrow(/imagePixels/);
    expect(() => readImageHeader(makePng(0, 5))).toThrow(/corrupt/);
    expect(() => readImageHeader(new Uint8Array(21 * 1024 * 1024))).toThrow(/tooLarge/);
    expect(() => readImageHeader(new TextEncoder().encode('hola'))).toThrow(/unsupported/);
    expect(() => readImageHeader(makePng(10, 10).slice(0, 16))).toThrow(/corrupt/);
    expect(() => readImageHeader(Uint8Array.from([0xff, 0xd8, 0xff, 0x00]))).toThrow(/corrupt/);
  });
});

describe('copia de trabajo', () => {
  it('calcula luminancia entera', () => {
    expect(lumaOf(255, 255, 255)).toBe(255);
    expect(lumaOf(0, 0, 0)).toBe(0);
    expect(lumaOf(255, 0, 0)).toBe(76);
  });

  it('reduce con filtro de caja respetando el alfa', () => {
    const rgba = Uint8Array.from([
      255, 255, 255, 255, 0, 0, 0, 255, 255, 255, 255, 0, 255, 255, 255, 0,
    ]);
    const s = rgbaToGraySource(rgba, 2, 2, 1, 1, 100);
    expect(s.alpha[0]).toBe(128);
    expect(s.luma[0]).toBe(128);
    const same = rgbaToGraySource(rgba, 2, 2, 2, 2, 100);
    expect(Array.from(same.luma)).toEqual([255, 0, 255, 255]);
    expect(() => rgbaToGraySource(rgba, 3, 2, 1, 1, 100)).toThrow();
    expect(() => rgbaToGraySource(rgba, 2, 2, 3, 3, 100)).toThrow();
  });

  it('limita el tamaño de trabajo por lado y por presupuesto', () => {
    expect(workingSize(4000, 1000, 1)).toEqual({ width: 2048, height: 512 });
    expect(workingSize(100, 50, 1)).toEqual({ width: 100, height: 50 });
    const many = workingSize(1000, 1000, 240);
    expect(many.width * many.height * 2 * 240).toBeLessThanOrEqual(192 * 1024 * 1024);
  });
});

describe('encuadre y remuestreo', () => {
  it('compone la transparencia sobre el fondo', () => {
    const s = grayFrom(2, 1, [0, 0], 0);
    expect(Array.from(compositeOnBackground(s, 'white'))).toEqual([255, 255]);
    expect(Array.from(compositeOnBackground(s, 'black'))).toEqual([0, 0]);
  });

  it('calcula la imagen integral', () => {
    const t = integralImage(Uint8Array.from([1, 2, 3, 4]), 2, 2);
    expect(t[2 * 3 + 2]).toBe(10);
  });

  it('coloca según el modo de ajuste', () => {
    expect(computePlacement(100, 50, 20, 20, params({ fit: 'contain' })).kx).toBe(0.2);
    expect(computePlacement(100, 50, 20, 20, params({ fit: 'cover' })).kx).toBe(0.4);
    const stretch = computePlacement(100, 50, 20, 20, params({ fit: 'stretch' }));
    expect([stretch.kx, stretch.ky]).toEqual([0.2, 0.4]);
    expect(
      computePlacement(100, 50, 20, 20, params({ fit: 'original', scalePercent: 200 })).kx,
    ).toBe(2);
    expect(computePlacement(100, 50, 20, 20, params({ rotation: 90 })).kx).toBe(0.2);
  });

  const quad = grayFrom(2, 2, [0, 255, 255, 255]);
  const render = (p: ImageParams, w = 2, h = 2) => {
    const c = compositeOnBackground(quad, p.background);
    return Array.from(resampleToTarget(c, integralImage(c, 2, 2), 2, 2, w, h, p));
  };

  it('identidad, volteos y rotaciones', () => {
    expect(render(params())).toEqual([0, 255, 255, 255]);
    expect(render(params({ flipH: true }))).toEqual([255, 0, 255, 255]);
    expect(render(params({ flipV: true }))).toEqual([255, 255, 0, 255]);
    expect(render(params({ rotation: 90 }))).toEqual([255, 0, 255, 255]);
    expect(render(params({ rotation: 180 }))).toEqual([255, 255, 255, 0]);
    expect(render(params({ rotation: 270 }))).toEqual([255, 255, 0, 255]);
  });

  it('usa el fondo fuera de la imagen y promedia al reducir', () => {
    expect(render(params({ offsetX: 2, background: 'black' }))).toEqual([0, 0, 0, 0]);
    expect(render(params(), 1, 1)).toEqual([191]);
    const up = render(params(), 4, 4);
    expect(up).toHaveLength(16);
    expect(up[0]).toBe(0);
    expect(up[15]).toBe(255);
  });
});

describe('niveles', () => {
  it('histograma y niveles automáticos', () => {
    const g = new Uint8Array(1000);
    for (let i = 0; i < 1000; i++) g[i] = 50 + (i % 100);
    const h = histogram(g);
    expect(h[50]).toBe(10);
    expect(autoLevels(h)).toEqual({ blackPoint: 50, whitePoint: 149 });
    expect(autoLevels(new Uint32Array(256))).toEqual({ blackPoint: 0, whitePoint: 255 });
    const flat = new Uint32Array(256);
    flat[100] = 10;
    expect(autoLevels(flat)).toEqual({ blackPoint: 0, whitePoint: 255 });
  });

  it('la tabla neutra es la identidad e invertir la refleja', () => {
    const lut = levelsLut(params());
    expect(Array.from(lut)).toEqual(Array.from({ length: 256 }, (_, i) => i));
    const inv = levelsLut(params({ invert: true }));
    expect(inv[0]).toBe(255);
    expect(applyLut(Uint8Array.from([10]), inv)[0]).toBe(245);
  });

  it('negro/blanco, gamma, brillo y contraste', () => {
    const lut = levelsLut(params({ blackPoint: 100, whitePoint: 200 }));
    expect([lut[50], lut[100], lut[150], lut[200], lut[250]]).toEqual([0, 0, 128, 255, 255]);
    expect(levelsLut(params({ gammaCenti: 200 }))[64]!).toBeGreaterThan(64);
    expect(levelsLut(params({ brightness: 100 }))[0]).toBe(128);
    expect(levelsLut(params({ contrast: 100 }))[64]).toBe(0);
  });

  it('sanea parámetros recibidos', () => {
    const p = sanitizeImageParams({
      fit: 'zoom',
      scalePercent: NaN,
      offsetX: 9999,
      rotation: 45,
      blackPoint: 200,
      whitePoint: 100,
      dither: 'atkinson',
      threshold: -5,
      flipH: 'sí',
      gammaCenti: Infinity,
    });
    expect(p.fit).toBe('contain');
    expect(p.scalePercent).toBe(100);
    expect(p.offsetX).toBe(512);
    expect(p.rotation).toBe(0);
    expect(p.blackPoint).toBeLessThan(p.whitePoint);
    expect(p.dither).toBe('atkinson');
    expect(p.threshold).toBe(0);
    expect(p.flipH).toBe(false);
    expect(p.gammaCenti).toBe(100);
    expect(sanitizeImageParams({ blackPoint: 254, whitePoint: 1 })).toMatchObject({
      blackPoint: 254,
      whitePoint: 255,
    });
  });
});

describe('tramado', () => {
  const gradient = (w: number, h: number) => {
    const t = new Uint8Array(w * h);
    for (let y = 0; y < h; y++)
      for (let x = 0; x < w; x++) t[y * w + x] = Math.round((x * 255) / (w - 1));
    return t;
  };
  const mean = (a: Uint8Array) => a.reduce((s, v) => s + v, 0) / a.length;

  it('umbral simple', () => {
    expect(Array.from(dither(Uint8Array.from([0, 127, 128, 255]), 4, 1, 'threshold', 128))).toEqual(
      [0, 0, 1, 1],
    );
  });

  it.each(['floyd-steinberg', 'sierra-lite', 'bayer4', 'bayer8'] as const)(
    '%s conserva el tono medio de un degradado',
    (mode) => {
      const out = dither(gradient(64, 32), 64, 32, mode, 128);
      expect(Math.abs(mean(out) - 0.5)).toBeLessThan(0.03);
    },
  );

  it('Atkinson pierde parte del error a propósito (más contraste)', () => {
    const flat = new Uint8Array(32 * 32).fill(128);
    const out = dither(flat, 32, 32, 'atkinson', 128);
    expect(mean(out)).toBeGreaterThan(0.4);
    expect(mean(out)).toBeLessThan(0.75);
  });

  it('los extremos no generan ruido', () => {
    for (const mode of [
      'floyd-steinberg',
      'atkinson',
      'sierra-lite',
      'bayer4',
      'bayer8',
    ] as const) {
      expect(mean(dither(new Uint8Array(100), 10, 10, mode, 128))).toBe(0);
      expect(mean(dither(new Uint8Array(100).fill(255), 10, 10, mode, 128))).toBe(1);
    }
  });

  it('Bayer 4×4 al 50 % produce un tablero', () => {
    const out = dither(new Uint8Array(16).fill(128), 4, 4, 'bayer4', 128);
    expect(out.reduce((s, v) => s + v, 0)).toBe(8);
  });

  it('matrices de Bayer correctas', () => {
    expect(bayerMatrix(2)).toEqual([
      [0, 2],
      [3, 1],
    ]);
    const m8 = bayerMatrix(8).flat();
    expect(new Set(m8).size).toBe(64);
    expect(() => bayerMatrix(3)).toThrow();
    expect(() => dither(new Uint8Array(1), 1, 1, 'ruido' as never, 128)).toThrow();
  });

  it('es determinista (mismo resultado en ejecuciones repetidas)', () => {
    const t = gradient(97, 31);
    expect(dither(t, 97, 31, 'floyd-steinberg', 100)).toEqual(
      dither(t, 97, 31, 'floyd-steinberg', 100),
    );
  });
});

describe('cadena completa', () => {
  it('convierte y encienden los oscuros o los claros', () => {
    const src = grayFrom(2, 1, [0, 255]);
    const pipe = new ImagePipeline(src);
    const dark = pipe.render(2, 1, params({ dither: 'threshold', fit: 'stretch' }));
    expect(Array.from(dark.pixels)).toEqual([1, 0]);
    expect(dark.histogram[0]).toBe(1);
    const light = pipe.render(
      2,
      1,
      params({ dither: 'threshold', fit: 'stretch', litFrom: 'light' }),
    );
    expect(Array.from(light.pixels)).toEqual([0, 1]);
    pipe.render(2, 1, params({ background: 'black' }));
    expect(pipe.tones(2, 1, params({ fit: 'stretch' })).length).toBe(2);
    pipe.release();
  });
});

describe('GIF', () => {
  function makeGif(
    frames: {
      x?: number;
      y?: number;
      w: number;
      h: number;
      px: number[];
      disposal?: number;
      delay?: number;
      transparent?: number;
      interlaced?: boolean;
    }[],
    width = 4,
    height = 4,
  ): Uint8Array {
    const buf = new Uint8Array(4096);
    const writer = new GifWriter(buf, width, height, {
      palette: [0x000000, 0xffffff, 0xff0000, 0x00ff00],
      loop: 0,
    });
    for (const f of frames) {
      const opts: Record<string, unknown> = { delay: f.delay ?? 10, disposal: f.disposal ?? 0 };
      if (f.transparent !== undefined) opts['transparent'] = f.transparent;
      writer.addFrame(f.x ?? 0, f.y ?? 0, f.w, f.h, f.px, opts);
    }
    return buf.slice(0, writer.end());
  }

  it('convierte retardos como los navegadores', () => {
    expect(gifDelayToMs(0)).toBe(100);
    expect(gifDelayToMs(1)).toBe(100);
    expect(gifDelayToMs(2)).toBe(20);
    expect(gifDelayToMs(50)).toBe(500);
    expect(gifDelayToMs(65535)).toBe(60_000);
  });

  it('compone cuadros con transparencia y eliminación', () => {
    const gif = makeGif([
      { w: 4, h: 4, px: new Array(16).fill(1), delay: 5 },
      // Cuadro parcial con transparencia: solo cambia un píxel.
      { x: 1, y: 1, w: 2, h: 1, px: [0, 3], transparent: 3, disposal: 2 },
      // Tras la eliminación 2 el área (1,1)-(2,1) queda transparente.
      { x: 0, y: 0, w: 1, h: 1, px: [0] },
    ]);
    const frames = decodeGif(gif);
    expect(frames).toHaveLength(3);
    expect(frames[0]!.durationMs).toBe(50);
    expect(frames[1]!.luma[1 * 4 + 1]).toBe(0);
    expect(frames[1]!.luma[1 * 4 + 2]).toBe(255);
    expect(frames[2]!.alpha[1 * 4 + 1]).toBe(0);
    expect(frames[2]!.alpha[1 * 4 + 2]).toBe(0);
    expect(frames[2]!.luma[0]).toBe(0);
    expect(frames[2]!.alpha[3]).toBe(255);
  });

  it('restaura al estado anterior con eliminación 3', () => {
    const gif = makeGif([
      { w: 4, h: 4, px: new Array(16).fill(1) },
      { x: 0, y: 0, w: 2, h: 2, px: [0, 0, 0, 0], disposal: 3 },
      { x: 3, y: 3, w: 1, h: 1, px: [0] },
    ]);
    const frames = decodeGif(gif);
    expect(frames[1]!.luma[0]).toBe(0);
    expect(frames[2]!.luma[0]).toBe(255);
    expect(frames[2]!.luma[15]).toBe(0);
  });

  it('informa del progreso y permite cancelar', () => {
    const gif = makeGif([
      { w: 4, h: 4, px: new Array(16).fill(1) },
      { w: 4, h: 4, px: new Array(16).fill(0) },
    ]);
    const seen: number[] = [];
    decodeGif(gif, { onProgress: (d) => seen.push(d) });
    expect(seen).toEqual([1, 2]);
    expect(() => decodeGif(gif, { isCancelled: () => true })).toThrow(/cancelled/);
  });

  it('rechaza GIF con demasiados cuadros, cuadros fuera del lienzo o datos dañados', () => {
    const three = makeGif([
      { w: 1, h: 1, px: [1] },
      { w: 1, h: 1, px: [1] },
      { w: 1, h: 1, px: [1] },
    ]);
    expect(() => decodeGif(three, { maxFrames: 2 })).toThrow(/tooManyFrames/);
    const outside = makeGif([{ x: 3, y: 3, w: 2, h: 2, px: [1, 1, 1, 1] }], 4, 4);
    expect(() => decodeGif(outside)).toThrow(/gifFrameBounds/);
    expect(() => decodeGif(new TextEncoder().encode('GIF89a'))).toThrow();
    expect(() => decodeGif(new TextEncoder().encode('no es gif'))).toThrow(/corrupt/);
    const truncated = three.slice(0, three.length - 12);
    expect(() => decodeGif(truncated)).not.toThrow(RangeError);
  });
});
