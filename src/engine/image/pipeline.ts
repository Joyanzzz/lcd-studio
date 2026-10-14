import { dither } from './dither.ts';
import { applyLut, histogram, levelsLut } from './levels.ts';
import type { ImageParams } from './params.ts';
import { compositeOnBackground, integralImage, resampleToTarget } from './resample.ts';
import type { GraySource } from './source.ts';

/**
 * Cadena completa imagen → mapa de bits del lienzo. Pura y determinista.
 * Guarda en caché la composición e imagen integral por fondo, que son lo más
 * costoso y no dependen del resto de parámetros.
 */
export class ImagePipeline {
  private readonly source: GraySource;
  private cache: { background: string; composite: Uint8Array; integral: Float64Array } | null =
    null;

  constructor(source: GraySource) {
    this.source = source;
  }

  private prepared(background: 'white' | 'black') {
    if (!this.cache || this.cache.background !== background) {
      const composite = compositeOnBackground(this.source, background);
      this.cache = {
        background,
        composite,
        integral: integralImage(composite, this.source.width, this.source.height),
      };
    }
    return this.cache;
  }

  /** Tonos del lienzo antes de niveles (para el histograma). */
  tones(targetWidth: number, targetHeight: number, params: ImageParams): Uint8Array {
    const { composite, integral } = this.prepared(params.background);
    return resampleToTarget(
      composite,
      integral,
      this.source.width,
      this.source.height,
      targetWidth,
      targetHeight,
      params,
    );
  }

  render(
    targetWidth: number,
    targetHeight: number,
    params: ImageParams,
  ): { pixels: Uint8Array; histogram: Uint32Array } {
    const tones = this.tones(targetWidth, targetHeight, params);
    const hist = histogram(tones);
    const adjusted = applyLut(tones, levelsLut(params));
    const light = dither(adjusted, targetWidth, targetHeight, params.dither, params.threshold);
    if (params.litFrom === 'dark') {
      for (let i = 0; i < light.length; i++) light[i] = light[i] ? 0 : 1;
    }
    return { pixels: light, histogram: hist };
  }

  release(): void {
    this.cache = null;
  }
}
