import { AppError } from '../core/errors.ts';
import type { ImageParams } from '../engine/image/params.ts';
import type { DecodedInfo, ImageRequest, ImageResponse } from './image-protocol.ts';

/**
 * Cliente del worker de imágenes en el hilo de la interfaz.
 *
 * - Cancelar termina el worker (también detiene un archivo que provoque un
 *   bucle en el decodificador) y libera toda su memoria.
 * - La decodificación tiene un límite de tiempo.
 * - Si el worker no puede decodificar PNG/JPEG/WebP (sin OffscreenCanvas),
 *   la interfaz lo decodifica con createImageBitmap y le envía los píxeles.
 */

interface Pending {
  resolve: (value: ImageResponse) => void;
  reject: (error: unknown) => void;
  onProgress?: ((done: number, total: number) => void) | undefined;
  timer?: ReturnType<typeof setTimeout>;
}

export const DECODE_TIMEOUT_MS = 60_000;

async function decodeOnMainThread(bytes: Uint8Array, mime: string) {
  const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
  const bitmap = await createImageBitmap(blob, {
    premultiplyAlpha: 'none',
    colorSpaceConversion: 'none',
  });
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new AppError('image.decodeUnavailable');
    ctx.drawImage(bitmap, 0, 0);
    const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
    canvas.width = 0;
    canvas.height = 0;
    return { rgba: data, width: bitmap.width, height: bitmap.height };
  } finally {
    bitmap.close();
  }
}

export class ImageWorkerClient {
  private worker: Worker | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();
  private readonly factory: () => Worker;

  constructor(factory: () => Worker) {
    this.factory = factory;
  }

  private ensure(): Worker {
    if (!this.worker) {
      const worker = this.factory();
      worker.onmessage = (event: MessageEvent<ImageResponse>) => this.onMessage(event.data);
      worker.onerror = (event) => {
        event.preventDefault();
        this.failAll(new AppError('image.corrupt'));
        this.terminate();
      };
      this.worker = worker;
    }
    return this.worker;
  }

  private onMessage(message: ImageResponse): void {
    const entry = this.pending.get(message.id);
    if (!entry) return;
    if (message.type === 'progress') {
      entry.onProgress?.(message.done, message.total);
      return;
    }
    if (entry.timer) clearTimeout(entry.timer);
    this.pending.delete(message.id);
    if (message.type === 'error')
      entry.reject(new AppError(message.code, { ...(message.params ?? {}) }));
    else entry.resolve(message);
  }

  private send(
    request: ImageRequest & { id: number },
    transfer: Transferable[],
    onProgress?: (done: number, total: number) => void,
    timeoutMs?: number,
  ): Promise<ImageResponse> {
    const worker = this.ensure();
    return new Promise((resolve, reject) => {
      const entry: Pending = { resolve, reject, onProgress };
      if (timeoutMs) {
        entry.timer = setTimeout(() => {
          this.cancel(new AppError('image.timeout'));
        }, timeoutMs);
      }
      this.pending.set(request.id, entry);
      worker.postMessage(request, transfer);
    });
  }

  async decode(
    bytes: Uint8Array,
    onProgress?: (done: number, total: number) => void,
  ): Promise<DecodedInfo> {
    const id = this.nextId++;
    // Se envía una copia: el original queda disponible por si hay que decodificar aquí.
    const copy = bytes.slice();
    const response = await this.send(
      { type: 'decode', id, bytes: copy },
      [copy.buffer],
      onProgress,
      DECODE_TIMEOUT_MS,
    );
    if (response.type === 'decoded') return response.info;
    if (response.type !== 'needsMainThreadDecode') throw new AppError('image.corrupt');
    const mime = bytes[0] === 0x89 ? 'image/png' : bytes[0] === 0xff ? 'image/jpeg' : 'image/webp';
    const raster = await decodeOnMainThread(bytes, mime);
    const id2 = this.nextId++;
    const again = await this.send(
      {
        type: 'decodeRgba',
        id: id2,
        bytes,
        rgba: raster.rgba,
        width: raster.width,
        height: raster.height,
      },
      [raster.rgba.buffer],
      undefined,
      DECODE_TIMEOUT_MS,
    );
    if (again.type !== 'decoded') throw new AppError('image.corrupt');
    return again.info;
  }

  async render(source: number, params: ImageParams, width: number, height: number) {
    const id = this.nextId++;
    const response = await this.send({ type: 'render', id, source, params, width, height }, []);
    if (response.type !== 'rendered') throw new AppError('image.corrupt');
    return { pixels: response.pixels, histogram: response.histogram };
  }

  async renderAll(
    params: ImageParams,
    width: number,
    height: number,
    onProgress?: (done: number, total: number) => void,
  ) {
    const id = this.nextId++;
    const response = await this.send(
      { type: 'renderAll', id, params, width, height },
      [],
      onProgress,
    );
    if (response.type !== 'renderedAll') throw new AppError('image.corrupt');
    return response.frames;
  }

  /** Libera las imágenes del worker sin terminarlo. */
  release(): void {
    this.worker?.postMessage({ type: 'release' } satisfies ImageRequest);
  }

  /** Cancela todo lo pendiente terminando el worker. */
  cancel(reason: unknown = new AppError('task.cancelled')): void {
    this.failAll(reason);
    this.terminate();
  }

  get busy(): boolean {
    return this.pending.size > 0;
  }

  dispose(): void {
    this.cancel();
  }

  private failAll(reason: unknown): void {
    for (const entry of this.pending.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      entry.reject(reason);
    }
    this.pending.clear();
  }

  private terminate(): void {
    this.worker?.terminate();
    this.worker = null;
  }
}
