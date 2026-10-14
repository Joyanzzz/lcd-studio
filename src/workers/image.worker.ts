import { ImageProcessor, type RasterDecoder } from './image-processor.ts';
import type { ImageRequest, ImageResponse } from './image-protocol.ts';

/**
 * Worker de imágenes: decodificación, remuestreo, niveles y tramado fuera del
 * hilo de la interfaz. Para cancelar, la interfaz termina el worker.
 */

interface WorkerScope {
  postMessage(message: ImageResponse, transfer?: Transferable[]): void;
  onmessage: ((event: MessageEvent<ImageRequest>) => void) | null;
}

const scope = self as unknown as WorkerScope;

/** Decodifica PNG/JPEG/WebP con las API del navegador disponibles en workers. */
const decodeRaster: RasterDecoder | null =
  typeof OffscreenCanvas === 'undefined' || typeof createImageBitmap === 'undefined'
    ? null
    : async (bytes, mime) => {
        const blob = new Blob([bytes as Uint8Array<ArrayBuffer>], { type: mime });
        const bitmap = await createImageBitmap(blob, {
          premultiplyAlpha: 'none',
          colorSpaceConversion: 'none',
        });
        try {
          const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
          const ctx = canvas.getContext('2d', { willReadFrequently: true });
          if (!ctx) return null;
          ctx.drawImage(bitmap, 0, 0);
          const data = ctx.getImageData(0, 0, bitmap.width, bitmap.height).data;
          // Libera la superficie del lienzo inmediatamente.
          canvas.width = 0;
          canvas.height = 0;
          return { rgba: data, width: bitmap.width, height: bitmap.height };
        } finally {
          bitmap.close();
        }
      };

const processor = new ImageProcessor(
  (message, transfer) => scope.postMessage(message, transfer ?? []),
  decodeRaster,
);

let queue: Promise<void> = Promise.resolve();
scope.onmessage = (event) => {
  // Procesa los mensajes en orden.
  queue = queue.then(() => processor.handle(event.data));
};
