import { describe, expect, it } from 'vitest';
import { LIMITS } from '../../../src/core/limits.ts';
import {
  ITEM_CHROME,
  THUMB_MIN_WIDTH,
  thumbSize,
  TIMELINE_ZOOM_HEIGHTS,
} from '../../../src/ui/canvas/timeline-layout.ts';

describe('miniaturas de la línea de tiempo', () => {
  it('conservan la proporción del lienzo en cada nivel de zoom', () => {
    for (let z = 0; z < TIMELINE_ZOOM_HEIGHTS.length; z++) {
      const s = thumbSize(128, 64, z, false, 1000, 3);
      expect(Math.abs(s.width / s.height - 2)).toBeLessThan(0.1);
      expect(s.height).toBe(TIMELINE_ZOOM_HEIGHTS[z]);
    }
  });

  it('ajustar reduce el tamaño hasta un mínimo legible y después se desplaza', () => {
    const few = thumbSize(80, 16, 4, true, 1000, 4);
    expect(few.fitsAll).toBe(true);
    const many = thumbSize(80, 16, 4, true, 1000, LIMITS.maxFrames);
    expect(many.width).toBe(THUMB_MIN_WIDTH);
    expect(many.fitsAll).toBe(false);
    expect(LIMITS.maxFrames * (many.width + ITEM_CHROME)).toBeGreaterThan(1000);
  });

  it('el tamaño es uniforme: no depende de la duración ni del fotograma', () => {
    expect(thumbSize(20, 20, 2, true, 600, 10)).toEqual(thumbSize(20, 20, 2, true, 600, 10));
  });

  it('lienzos muy altos se limitan en altura', () => {
    const s = thumbSize(1, 512, 0, false, 500, 1);
    expect(s.width).toBe(THUMB_MIN_WIDTH);
    expect(s.height).toBe(3 * TIMELINE_ZOOM_HEIGHTS[0]!);
  });
});
