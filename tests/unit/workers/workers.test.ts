import { GifWriter } from 'omggif';
import { describe, expect, it } from 'vitest';
import { DEFAULT_IMAGE_PARAMS } from '../../../src/engine/image/params.ts';
import { getExporter, runExport } from '../../../src/exporters/index.ts';
import { decodeOpenResponse } from '../../../src/platform/tauri.ts';
import { createExportHandler, deserializeProject } from '../../../src/workers/export-runner.ts';
import { FrameMirrorClient, FrameMirrorStore } from '../../../src/workers/frame-mirror.ts';
import { createProjectHandler } from '../../../src/workers/project-runner.ts';
import { serializeProject } from '../../../src/core/project-format.ts';
import { createFrame, insertFrames, replaceFramePixels } from '../../../src/core/project.ts';
import { ImageProcessor } from '../../../src/workers/image-processor.ts';
import type { ImageResponse } from '../../../src/workers/image-protocol.ts';
import { ctxFor, makeProject } from '../../helpers/projects.ts';
import { goldenPatterns } from '../../helpers/bitmap.ts';

function gif(): Uint8Array {
  const buf = new Uint8Array(2048);
  const w = new GifWriter(buf, 4, 2, { palette: [0x000000, 0xffffff], loop: 0 });
  w.addFrame(0, 0, 4, 2, [0, 1, 0, 1, 1, 0, 1, 0], { delay: 5 });
  w.addFrame(0, 0, 4, 2, [1, 1, 1, 1, 0, 0, 0, 0], { delay: 8 });
  return buf.slice(0, w.end());
}

describe('procesador de imágenes', () => {
  function setup(raster: ConstructorParameters<typeof ImageProcessor>[1] = null) {
    const messages: ImageResponse[] = [];
    const proc = new ImageProcessor((m) => messages.push(m), raster);
    return { proc, messages };
  }

  it('decodifica GIF, informa del progreso y renderiza cada cuadro', async () => {
    const { proc, messages } = setup();
    await proc.handle({ type: 'decode', id: 1, bytes: gif() });
    expect(messages.filter((m) => m.type === 'progress')).toHaveLength(2);
    const decoded = messages.find((m) => m.type === 'decoded');
    expect(
      decoded && decoded.type === 'decoded' && decoded.info.sources.map((s) => s.durationMs),
    ).toEqual([50, 80]);
    await proc.handle({
      type: 'render',
      id: 2,
      source: 0,
      params: { ...DEFAULT_IMAGE_PARAMS, dither: 'threshold', fit: 'stretch' },
      width: 4,
      height: 2,
    });
    const rendered = messages.find((m) => m.type === 'rendered');
    expect(rendered && rendered.type === 'rendered' && Array.from(rendered.pixels)).toEqual([
      1, 0, 1, 0, 0, 1, 0, 1,
    ]);
    await proc.handle({
      type: 'renderAll',
      id: 3,
      params: DEFAULT_IMAGE_PARAMS,
      width: 4,
      height: 2,
    });
    const all = messages.find((m) => m.type === 'renderedAll');
    expect(all && all.type === 'renderedAll' && all.frames.length).toBe(2);
    await proc.handle({ type: 'release' });
    await proc.handle({
      type: 'render',
      id: 4,
      source: 0,
      params: DEFAULT_IMAGE_PARAMS,
      width: 4,
      height: 2,
    });
    expect(messages.at(-1)).toMatchObject({ type: 'error', id: 4 });
  });

  it('pide decodificar en la interfaz si no hay decodificador en el worker', async () => {
    const { proc, messages } = setup();
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0,
      2, 0, 0, 0, 1,
    ]);
    await proc.handle({ type: 'decode', id: 1, bytes: png });
    expect(messages).toEqual([{ type: 'needsMainThreadDecode', id: 1 }]);
    await proc.handle({
      type: 'decodeRgba',
      id: 2,
      bytes: png,
      rgba: Uint8ClampedArray.from([0, 0, 0, 255, 255, 255, 255, 255]),
      width: 2,
      height: 1,
    });
    expect(messages.at(-1)).toMatchObject({ type: 'decoded', id: 2 });
    // Dimensiones que no coinciden con la cabecera: se rechaza.
    await proc.handle({
      type: 'decodeRgba',
      id: 3,
      bytes: png,
      rgba: new Uint8ClampedArray(16),
      width: 4,
      height: 1,
    });
    expect(messages.at(-1)).toMatchObject({ type: 'error', id: 3, code: 'image.corrupt' });
  });

  it('usa el decodificador del worker cuando existe', async () => {
    const { proc, messages } = setup(async () => ({
      rgba: new Uint8ClampedArray(2 * 4).fill(255),
      width: 2,
      height: 1,
    }));
    const png = Uint8Array.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0,
      2, 0, 0, 0, 1,
    ]);
    await proc.handle({ type: 'decode', id: 1, bytes: png });
    expect(messages.at(-1)).toMatchObject({ type: 'decoded' });
    const nullDecoder = setup(async () => null);
    await nullDecoder.proc.handle({ type: 'decode', id: 9, bytes: png });
    expect(nullDecoder.messages.at(-1)).toEqual({ type: 'needsMainThreadDecode', id: 9 });
  });

  it('rechaza archivos no admitidos con un código de error', async () => {
    const { proc, messages } = setup();
    await proc.handle({ type: 'decode', id: 1, bytes: new TextEncoder().encode('<svg/>') });
    expect(messages).toEqual([{ type: 'error', id: 1, code: 'image.unsupported', params: {} }]);
  });
});

describe('worker de exportación', () => {
  const project = makeProject('graphic-custom', [{ pixels: goldenPatterns(9, 5).checker }], {
    width: 9,
    height: 5,
  });
  const request = (mirror: FrameMirrorClient, extra: Record<string, unknown>) => ({
    id: 1,
    kind: 'export' as const,
    exporterId: 'png',
    options: {},
    project: mirror.encode(project).project,
    currentFrame: 0,
    appVersion: '1.0.0',
    experimental: false,
    ...extra,
  });

  it('produce los mismos bytes que la exportación directa', () => {
    const handle = createExportHandler();
    const response = handle(request(new FrameMirrorClient(), { options: { scale: 3 } }));
    const direct = runExport(getExporter('png')!, ctxFor(project), { scale: 3 });
    expect(response.type === 'done' && response.outcome.files![0]!.data).toEqual(
      direct.files![0]!.data,
    );
  });

  it('valida en el worker y reutiliza los fotogramas ya enviados', () => {
    const handle = createExportHandler();
    const mirror = new FrameMirrorClient();
    const first = handle(request(mirror, { kind: 'inspect' }));
    expect(first.type).toBe('inspected');
    const again = mirror.encode(project).project;
    expect(again.frames[0]!.pixels).toBeUndefined();
    const second = handle({ ...request(mirror, { kind: 'inspect' }), project: again });
    expect(second.type).toBe('inspected');
    // Un worker nuevo no conoce el fotograma: el cliente debe reiniciar el espejo.
    expect(createExportHandler()({ ...request(mirror, {}), project: again })).toEqual({
      id: 1,
      type: 'error',
      code: 'project.invalid',
    });
    mirror.reset();
    expect(mirror.encode(project).project.frames[0]!.pixels).toBeDefined();
  });

  it('no ejecuta exportadores experimentales si no están activados', () => {
    const p = makeProject('hd44780-16x2', [{ pixels: new Uint8Array(80 * 16) }]);
    const base = {
      ...request(new FrameMirrorClient(), {}),
      project: new FrameMirrorClient().encode(p).project,
    };
    expect(createExportHandler()({ ...base, exporterId: 'pic-xc8' })).toEqual({
      id: 1,
      type: 'error',
      code: 'export.internal',
    });
    expect(createExportHandler()({ ...base, exporterId: 'pic-xc8', experimental: true }).type).toBe(
      'done',
    );
  });

  it('valida el proyecto recibido', () => {
    const frames = [{ durationMs: 100, pixels: new Uint8Array(45) }];
    const s = { ...new FrameMirrorClient().encode(project).project, frames };
    expect(() => deserializeProject({ ...s, loopMode: 'x' })).toThrow();
    expect(() => deserializeProject({ ...s, appearance: { palette: 'nope' } })).toThrow();
    expect(() => deserializeProject({ ...s, width: 10 })).toThrow();
    const store = new FrameMirrorStore();
    const mirror = new FrameMirrorClient();
    store.decode(mirror.encode(project).project);
    expect(store.size).toBe(1);
    store.decode({ ...mirror.encode(project).project, frames: [] });
    expect(store.size).toBe(0);
  });

  it('reenvía un fotograma que vuelve tras deshacer', () => {
    const a = makeProject('hd44780-16x2', [{ pixels: new Uint8Array(80 * 16) }]);
    const b = replaceFramePixels(a, 0, new Uint8Array(80 * 16).fill(1));
    const twice = insertFrames(a, 1, [createFrame(a.frames[0]!.pixels, 300)]);
    const store = new FrameMirrorStore();
    const mirror = new FrameMirrorClient();
    for (const p of [a, b, a, twice, b, twice]) {
      const decoded = store.decode(mirror.encode(p).project);
      expect(decoded.map((f) => f.pixels)).toEqual(p.frames.map((f) => f.pixels));
      expect(store.size).toBe(new Set(p.frames.map((f) => f.pixels)).size);
    }
    // Un arreglo repetido en el mismo proyecto solo se copia una vez.
    const fresh = new FrameMirrorClient().encode(twice);
    expect(fresh.transfer).toHaveLength(1);
    expect(fresh.project.frames.map((f) => f.pixels !== undefined)).toEqual([true, false]);
  });
});

describe('worker de proyectos', () => {
  it('serializa con el espejo y analiza archivos', () => {
    const project = makeProject('hd44780-16x2', [{ pixels: new Uint8Array(80 * 16).fill(1) }]);
    const handle = createProjectHandler();
    const mirror = new FrameMirrorClient();
    const gen = { name: 'LCD Studio', version: 't' };
    const r = handle({
      type: 'serialize',
      id: 2,
      project: mirror.encode(project).project,
      generator: gen,
    });
    expect(r.response.type === 'serialized' && r.response.bytes).toEqual(
      serializeProject(project, gen),
    );
    const parsed = handle({ type: 'parse', id: 3, bytes: serializeProject(project, gen) });
    expect(parsed.response).toMatchObject({ type: 'parsed', ok: true });
    const bad = handle({ type: 'parse', id: 4, bytes: new TextEncoder().encode('{') });
    expect(bad.response).toMatchObject({ type: 'parsed', ok: false });
    const unknown = handle({
      type: 'serialize',
      id: 5,
      project: { ...mirror.encode(project).project, frames: [{ durationMs: 200, token: 999 }] },
      generator: gen,
    });
    expect(unknown.response).toMatchObject({ type: 'failed' });
  });
});

describe('respuesta de apertura en escritorio', () => {
  it('decodifica nombre y contenido', () => {
    const name = new TextEncoder().encode('ñandú.lcdstudio.json');
    const buf = new Uint8Array(4 + name.length + 3);
    new DataView(buf.buffer).setUint32(0, name.length, true);
    buf.set(name, 4);
    buf.set([1, 2, 3], 4 + name.length);
    expect(decodeOpenResponse(buf.buffer)).toEqual({
      name: 'ñandú.lcdstudio.json',
      bytes: Uint8Array.from([1, 2, 3]),
    });
    expect(() => decodeOpenResponse(new ArrayBuffer(2))).toThrow();
    const bad = new Uint8Array(4);
    new DataView(bad.buffer).setUint32(0, 99, true);
    expect(() => decodeOpenResponse(bad.buffer)).toThrow();
  });
});
