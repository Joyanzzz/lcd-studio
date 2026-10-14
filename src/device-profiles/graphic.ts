import type { GraphicProfile } from './types.ts';

/** Perfiles de pantallas gráficas monocromas. */
export const GRAPHIC_PROFILES: readonly GraphicProfile[] = Object.freeze([
  Object.freeze({
    kind: 'graphic',
    content: 'raster',
    id: 'ssd1306-128x64',
    labelKey: 'profile.ssd1306-128x64',
    controller: 'SSD1306',
    fixedSize: Object.freeze({ width: 128, height: 64 }),
    i2cAddresses: Object.freeze([0x3c, 0x3d]),
  }),
  Object.freeze({
    kind: 'graphic',
    content: 'raster',
    id: 'ssd1306-128x32',
    labelKey: 'profile.ssd1306-128x32',
    controller: 'SSD1306',
    fixedSize: Object.freeze({ width: 128, height: 32 }),
    i2cAddresses: Object.freeze([0x3c, 0x3d]),
  }),
  Object.freeze({
    kind: 'graphic',
    content: 'raster',
    id: 'pcd8544-84x48',
    labelKey: 'profile.pcd8544-84x48',
    controller: 'PCD8544',
    fixedSize: Object.freeze({ width: 84, height: 48 }),
    i2cAddresses: Object.freeze([]),
  }),
  Object.freeze({
    kind: 'graphic',
    content: 'raster',
    id: 'ks0108-128x64',
    labelKey: 'profile.ks0108-128x64',
    controller: 'KS0108',
    fixedSize: Object.freeze({ width: 128, height: 64 }),
    i2cAddresses: Object.freeze([]),
  }),
  Object.freeze({
    kind: 'graphic',
    content: 'raster',
    id: 'graphic-custom',
    labelKey: 'profile.graphic-custom',
    controller: null,
    fixedSize: null,
    i2cAddresses: Object.freeze([]),
  }),
]);
