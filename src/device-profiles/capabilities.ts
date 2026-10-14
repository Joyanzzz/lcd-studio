import type { DisplayProfile } from './types.ts';

/**
 * Conexiones y destinos de generación de código admitidos por cada perfil.
 *
 * Solo se listan combinaciones que el programa genera de verdad: el
 * asistente de proyecto y la exportación ofrecen únicamente estas. El bus de
 * 4 u 8 bits es una conexión del HD44780 (paralelo), no una profundidad de
 * color ni una opción de otras pantallas.
 */

export type ConnectionId =
  | 'hd44780-4bit'
  | 'hd44780-8bit'
  | 'hd44780-i2c-pcf8574'
  | 'i2c'
  | 'spi'
  | 'parallel'
  | 'max7219-spi';

export interface CodeTarget {
  /** Identificador del exportador que genera el código. */
  readonly exporterId: string;
  /** Clave de traducción de la plataforma/biblioteca. */
  readonly labelKey: string;
  /** Genera un programa completo (boceto) o solo tablas de datos para incluir. */
  readonly output: 'sketch' | 'data';
  readonly stability: 'stable' | 'experimental';
}

export interface ConnectionOption {
  readonly id: ConnectionId;
  readonly labelKey: string;
  readonly targets: readonly CodeTarget[];
}

const LIQUIDCRYSTAL: CodeTarget = {
  exporterId: 'arduino-liquidcrystal',
  labelKey: 'target.arduino-liquidcrystal',
  output: 'sketch',
  stability: 'stable',
};
const LIQUIDCRYSTAL_I2C: CodeTarget = {
  exporterId: 'arduino-liquidcrystal-i2c',
  labelKey: 'target.arduino-liquidcrystal-i2c',
  output: 'sketch',
  stability: 'stable',
};
const XC8: CodeTarget = {
  exporterId: 'pic-xc8',
  labelKey: 'target.pic-xc8',
  output: 'sketch',
  stability: 'experimental',
};
const ADAFRUIT_SKETCH: CodeTarget = {
  exporterId: 'adafruit-gfx',
  labelKey: 'target.adafruit-gfx.sketch',
  output: 'sketch',
  stability: 'stable',
};
const ADAFRUIT_DATA: CodeTarget = {
  exporterId: 'adafruit-gfx',
  labelKey: 'target.adafruit-gfx.data',
  output: 'data',
  stability: 'stable',
};
const U8G2_SKETCH: CodeTarget = {
  exporterId: 'u8g2-xbm',
  labelKey: 'target.u8g2-xbm.sketch',
  output: 'sketch',
  stability: 'stable',
};
const U8G2_DATA: CodeTarget = {
  exporterId: 'u8g2-xbm',
  labelKey: 'target.u8g2-xbm.data',
  output: 'data',
  stability: 'stable',
};
const PAGES: CodeTarget = {
  exporterId: 'vertical-pages',
  labelKey: 'target.vertical-pages',
  output: 'data',
  stability: 'stable',
};
const MAX7219: CodeTarget = {
  exporterId: 'arduino-max7219',
  labelKey: 'target.arduino-max7219',
  output: 'sketch',
  stability: 'stable',
};

export function connectionsFor(profile: DisplayProfile): readonly ConnectionOption[] {
  if (profile.kind === 'character') {
    return [
      { id: 'hd44780-4bit', labelKey: 'connection.hd44780-4bit', targets: [LIQUIDCRYSTAL, XC8] },
      { id: 'hd44780-8bit', labelKey: 'connection.hd44780-8bit', targets: [XC8] },
      {
        id: 'hd44780-i2c-pcf8574',
        labelKey: 'connection.hd44780-i2c-pcf8574',
        targets: [LIQUIDCRYSTAL_I2C],
      },
    ];
  }
  if (profile.kind === 'led-matrix') {
    return [{ id: 'max7219-spi', labelKey: 'connection.max7219-spi', targets: [MAX7219] }];
  }
  switch (profile.controller) {
    case 'SSD1306':
      return [
        { id: 'i2c', labelKey: 'connection.i2c', targets: [ADAFRUIT_SKETCH, U8G2_SKETCH, PAGES] },
        { id: 'spi', labelKey: 'connection.spi', targets: [ADAFRUIT_DATA, U8G2_DATA, PAGES] },
      ];
    case 'PCD8544':
      return [
        { id: 'spi', labelKey: 'connection.spi', targets: [ADAFRUIT_DATA, U8G2_DATA, PAGES] },
      ];
    case 'KS0108':
      return [
        {
          id: 'parallel',
          labelKey: 'connection.parallel',
          targets: [ADAFRUIT_DATA, U8G2_DATA, PAGES],
        },
      ];
    default:
      return [];
  }
}

/** Destinos de código para un perfil y conexión (o todos los del perfil si no hay conexión). */
export function targetsFor(
  profile: DisplayProfile,
  connection: ConnectionId | null,
): readonly CodeTarget[] {
  const options = connectionsFor(profile);
  if (connection) return options.find((o) => o.id === connection)?.targets ?? [];
  // Pantalla gráfica genérica: sin conexión fija, solo tablas de datos.
  if (options.length === 0)
    return profile.kind === 'graphic' ? [ADAFRUIT_DATA, U8G2_DATA, PAGES] : [];
  const seen = new Map<string, CodeTarget>();
  for (const o of options)
    for (const t of o.targets) if (!seen.has(t.exporterId)) seen.set(t.exporterId, t);
  return [...seen.values()];
}

export function isConnectionFor(profile: DisplayProfile, value: unknown): value is ConnectionId {
  return connectionsFor(profile).some((o) => o.id === value);
}
