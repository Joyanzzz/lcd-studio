import type { ImageParams } from '../engine/image/params.ts';

/** Mensajes entre la interfaz y el worker de imágenes. */

export interface SourceInfo {
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
}

export interface DecodedInfo {
  readonly format: 'png' | 'jpeg' | 'webp' | 'gif';
  readonly originalWidth: number;
  readonly originalHeight: number;
  readonly animatedWebp: boolean;
  readonly sources: readonly SourceInfo[];
}

export type ImageRequest =
  | { readonly type: 'decode'; readonly id: number; readonly bytes: Uint8Array }
  | {
      readonly type: 'decodeRgba';
      readonly id: number;
      readonly bytes: Uint8Array;
      readonly rgba: Uint8ClampedArray;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly type: 'render';
      readonly id: number;
      readonly source: number;
      readonly params: ImageParams;
      readonly width: number;
      readonly height: number;
    }
  | {
      readonly type: 'renderAll';
      readonly id: number;
      readonly params: ImageParams;
      readonly width: number;
      readonly height: number;
    }
  | { readonly type: 'release' };

export type ImageResponse =
  | {
      readonly type: 'progress';
      readonly id: number;
      readonly done: number;
      readonly total: number;
    }
  | { readonly type: 'decoded'; readonly id: number; readonly info: DecodedInfo }
  /** El worker no puede decodificar este formato (sin OffscreenCanvas): debe hacerlo la interfaz. */
  | { readonly type: 'needsMainThreadDecode'; readonly id: number }
  | {
      readonly type: 'rendered';
      readonly id: number;
      readonly pixels: Uint8Array;
      readonly histogram: Uint32Array;
    }
  | {
      readonly type: 'renderedAll';
      readonly id: number;
      readonly frames: readonly { readonly pixels: Uint8Array; readonly durationMs: number }[];
    }
  | {
      readonly type: 'error';
      readonly id: number;
      readonly code: string;
      readonly params?: Readonly<Record<string, string | number>>;
    };
