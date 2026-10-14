import { describe, expect, it } from 'vitest';
import {
  assertCanvasSize,
  assertDecodedImageSize,
  checkedMul,
  clampInt,
  frameMemoryBytes,
  isIntInRange,
  isNonNegativeInt,
  isSafeInt,
  isValidCanvasSize,
  isValidDuration,
  isValidFrameCount,
  LimitError,
  LIMITS,
  nameLength,
  projectMemoryBytes,
} from '../../../src/core/limits.ts';

describe('límites centralizados', () => {
  it('declara los límites del producto', () => {
    expect(LIMITS.canvasMaxSide).toBe(512);
    expect(LIMITS.maxFrames).toBe(240);
    expect(LIMITS.frameDurationMinMs).toBe(20);
    expect(LIMITS.frameDurationMaxMs).toBe(60_000);
    expect(LIMITS.imageMaxCompressedBytes).toBe(20 * 1024 * 1024);
    expect(LIMITS.imageMaxDecodedPixels).toBe(16_000_000);
    expect(LIMITS.projectMaxFileBytes).toBe(20 * 1024 * 1024);
    expect(LIMITS.nameMaxLength).toBe(64);
    expect(LIMITS.historyMaxBytes).toBe(128 * 1024 * 1024);
    expect(LIMITS.historyMaxDepth).toBe(100);
    expect(Object.isFrozen(LIMITS)).toBe(true);
  });

  it.each([NaN, Infinity, -Infinity, 1.5, -0.1, '3', null, undefined, 2 ** 53])(
    'rechaza %s como entero seguro',
    (value) => {
      expect(isSafeInt(value)).toBe(false);
    },
  );

  it('acepta enteros válidos', () => {
    expect(isSafeInt(0)).toBe(true);
    expect(isNonNegativeInt(-1)).toBe(false);
    expect(isNonNegativeInt(5)).toBe(true);
    expect(isIntInRange(5, 1, 5)).toBe(true);
    expect(isIntInRange(6, 1, 5)).toBe(false);
  });

  it('multiplica con detección de desbordamiento', () => {
    expect(checkedMul(1000, 10, 10)).toBe(100);
    expect(() => checkedMul(99, 10, 10)).toThrow(LimitError);
    expect(() => checkedMul(Number.MAX_SAFE_INTEGER, 2 ** 30, 2 ** 30)).toThrow(LimitError);
    expect(() => checkedMul(100, NaN)).toThrow(LimitError);
    expect(() => checkedMul(100, -1)).toThrow(LimitError);
    expect(() => checkedMul(100, Infinity)).toThrow(LimitError);
  });

  it('valida dimensiones del lienzo', () => {
    expect(isValidCanvasSize(1, 1)).toBe(true);
    expect(isValidCanvasSize(512, 512)).toBe(true);
    for (const bad of [0, 513, -1, NaN, Infinity, 1.5]) {
      expect(isValidCanvasSize(bad, 10)).toBe(false);
      expect(isValidCanvasSize(10, bad)).toBe(false);
    }
    expect(() => assertCanvasSize(513, 1)).toThrow(LimitError);
  });

  it('valida duraciones y número de fotogramas', () => {
    expect(isValidDuration(20)).toBe(true);
    expect(isValidDuration(60_000)).toBe(true);
    expect(isValidDuration(19)).toBe(false);
    expect(isValidDuration(60_001)).toBe(false);
    expect(isValidDuration(100.5)).toBe(false);
    expect(isValidFrameCount(240)).toBe(true);
    expect(isValidFrameCount(241)).toBe(false);
    expect(isValidFrameCount(0)).toBe(false);
  });

  it('calcula la memoria antes de reservarla', () => {
    expect(frameMemoryBytes(128, 64)).toBe(8192);
    expect(projectMemoryBytes(512, 512, 240)).toBe(512 * 512 * 240);
    expect(() => projectMemoryBytes(512, 512, 241)).toThrow(LimitError);
    expect(() => projectMemoryBytes(1024, 1, 1)).toThrow(LimitError);
  });

  it('limita imágenes decodificadas a 16 MP', () => {
    expect(() => assertDecodedImageSize(4000, 4000)).not.toThrow();
    expect(() => assertDecodedImageSize(4001, 4000)).toThrow(LimitError);
    expect(() => assertDecodedImageSize(0, 10)).toThrow(LimitError);
    expect(() => assertDecodedImageSize(70_000, 1)).toThrow(LimitError);
  });

  it('acota números con valor de reserva para no finitos', () => {
    expect(clampInt(NaN, 0, 10, 5)).toBe(5);
    expect(clampInt(Infinity, 0, 10, 5)).toBe(5);
    expect(clampInt(-3, 0, 10, 5)).toBe(0);
    expect(clampInt(30, 0, 10, 5)).toBe(10);
    expect(clampInt(4.6, 0, 10, 5)).toBe(5);
  });

  it('mide nombres en puntos de código', () => {
    expect(nameLength('añ😀')).toBe(3);
  });

  it('expone código y parámetros en los errores', () => {
    const error = new LimitError('limits.test', { a: 1 });
    expect(error.code).toBe('limits.test');
    expect(error.params).toEqual({ a: 1 });
    expect(error.name).toBe('LimitError');
  });
});
