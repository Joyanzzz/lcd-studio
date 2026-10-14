import { AppError, isAppError } from '../core/errors.ts';
import { LIMITS } from '../core/limits.ts';
import { decodeGif } from '../engine/image/gif-decode.ts';
import { sanitizeImageParams } from '../engine/image/params.ts';
import { ImagePipeline } from '../engine/image/pipeline.ts';
import { readImageHeader, type ImageHeader } from '../engine/image/sniff.ts';
import { rgbaToGraySource, workingSize, type GraySource } from '../engine/image/source.ts';
import type { DecodedInfo, ImageRequest, ImageResponse } from './image-protocol.ts';

/**
 * Lógica del worker de imágenes, separada del objeto global del worker para
 * poder probarla en Node. Mantiene las imágenes decodificadas y sus cachés.
 */

export type RasterDecoder = (
  bytes: Uint8Array,
  mime: string,
) => Promise<{ rgba: Uint8ClampedArray; width: number; height: number } | null>;

export class ImageProcessor {
  private sources: GraySource[] = [];
  private pipelines: ImagePipeline[] = [];
  private readonly post: (message: ImageResponse, transfer?: Transferable[]) => void;
  private readonly decodeRaster: RasterDecoder | null;

  constructor(
    post: (message: ImageResponse, transfer?: Transferable[]) => void,
    decodeRaster: RasterDecoder | null,
  ) {
    this.post = post;
    this.decodeRaster = decodeRaster;
  }

  async handle(message: ImageRequest): Promise<void> {
    if (message.type === 'release') {
      this.release();
      return;
    }
    try {
      switch (message.type) {
        case 'decode':
          await this.decode(message.id, message.bytes);
          break;
        case 'decodeRgba':
          this.acceptRgba(message.id, message.bytes, message.rgba, message.width, message.height);
          break;
        case 'render':
          this.render(message.id, message.source, message.params, message.width, message.height);
          break;
        case 'renderAll':
          this.renderAll(message.id, message.params, message.width, message.height);
          break;
      }
    } catch (error) {
      this.post({
        type: 'error',
        id: message.id,
        code: isAppError(error) ? error.code : 'image.corrupt',
        ...(isAppError(error) ? { params: { ...error.params } } : {}),
      });
    }
  }

  release(): void {
    for (const p of this.pipelines) p.release();
    this.sources = [];
    this.pipelines = [];
  }

  private setSources(sources: GraySource[], header: ImageHeader, id: number): void {
    this.release();
    this.sources = sources;
    this.pipelines = sources.map((s) => new ImagePipeline(s));
    const info: DecodedInfo = {
      format: header.format,
      originalWidth: header.width,
      originalHeight: header.height,
      animatedWebp: header.animatedWebp,
      sources: sources.map((s) => ({ width: s.width, height: s.height, durationMs: s.durationMs })),
    };
    this.post({ type: 'decoded', id, info });
  }

  private async decode(id: number, bytes: Uint8Array): Promise<void> {
    const header = readImageHeader(bytes);
    if (header.format === 'gif') {
      const sources = decodeGif(bytes, {
        onProgress: (done, total) => this.post({ type: 'progress', id, done, total }),
      });
      this.setSources(sources, header, id);
      return;
    }
    if (!this.decodeRaster) {
      this.post({ type: 'needsMainThreadDecode', id });
      return;
    }
    const raster = await this.decodeRaster(bytes, `image/${header.format}`);
    if (!raster) {
      this.post({ type: 'needsMainThreadDecode', id });
      return;
    }
    this.acceptRgba(id, bytes, raster.rgba, raster.width, raster.height);
  }

  private acceptRgba(
    id: number,
    bytes: Uint8Array,
    rgba: Uint8ClampedArray,
    width: number,
    height: number,
  ): void {
    const header = readImageHeader(bytes);
    // El decodificador debe coincidir con la cabecera ya validada.
    if (width !== header.width || height !== header.height) throw new AppError('image.corrupt');
    const size = workingSize(width, height, 1);
    const source = rgbaToGraySource(
      rgba,
      width,
      height,
      size.width,
      size.height,
      LIMITS.frameDurationDefaultMs,
    );
    this.setSources([source], header, id);
  }

  private render(
    id: number,
    index: number,
    rawParams: unknown,
    width: number,
    height: number,
  ): void {
    const pipeline = this.pipelines[index];
    if (!pipeline) throw new AppError('image.corrupt');
    const params = sanitizeImageParams(rawParams as Record<string, unknown>);
    const { pixels, histogram } = pipeline.render(width, height, params);
    this.post({ type: 'rendered', id, pixels, histogram }, [pixels.buffer, histogram.buffer]);
  }

  private renderAll(id: number, rawParams: unknown, width: number, height: number): void {
    const params = sanitizeImageParams(rawParams as Record<string, unknown>);
    if (this.sources.length > LIMITS.maxFrames) {
      throw new AppError('image.tooManyFrames', {
        count: this.sources.length,
        max: LIMITS.maxFrames,
      });
    }
    const frames = this.pipelines.map((p, i) => {
      const result = p.render(width, height, params);
      this.post({ type: 'progress', id, done: i + 1, total: this.pipelines.length });
      return { pixels: result.pixels, durationMs: this.sources[i]!.durationMs };
    });
    this.post(
      { type: 'renderedAll', id, frames },
      frames.map((f) => f.pixels.buffer),
    );
  }
}
