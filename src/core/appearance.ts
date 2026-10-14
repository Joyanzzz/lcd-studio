/**
 * Apariencia de la pantalla simulada. Solo afecta a la vista previa y a las
 * exportaciones de imagen (PNG, hoja de sprites, GIF); nunca al código.
 */

export interface LcdColors {
  /** Marco alrededor de la pantalla. */
  readonly frame: string;
  /** Fondo del cristal. */
  readonly screen: string;
  /** Píxel apagado. */
  readonly off: string;
  /** Píxel encendido. */
  readonly on: string;
}

export interface Palette {
  readonly id: string;
  readonly labelKey: string;
  readonly colors: LcdColors;
}

export const PALETTES: readonly Palette[] = Object.freeze([
  p('lm016l', '#1e2a12', '#b6cf5a', '#a9c24c', '#18220c'),
  p('green', '#1b2210', '#a8c63a', '#9bb92f', '#1d2a08'),
  p('yellow', '#16140a', '#e8d84a', '#dccb3e', '#121006'),
  p('blue', '#0c1226', '#1b3fb0', '#2748c4', '#eef4ff'),
  p('red', '#1a0606', '#2a0505', '#360909', '#ff4a3d'),
  p('paper', '#20242b', '#d9e1d3', '#cdd6c6', '#161b14'),
  p('oled', '#050505', '#000000', '#0c0c0c', '#f4f4f4'),
  p('oled-blue', '#050505', '#000000', '#07101a', '#47b4ff'),
  p('amber', '#0a0602', '#120a02', '#1a0f03', '#ffa81f'),
  // Matriz de LEDs: el «apagado» es el LED rojo sin corriente.
  p('led-red', '#0e0e10', '#050506', '#2c0d0b', '#ff3b28'),
  p('led-green', '#0e0e10', '#050506', '#0c2410', '#3cff5a'),
]);

function p(id: string, frame: string, screen: string, off: string, on: string): Palette {
  return Object.freeze({
    id,
    labelKey: `palette.${id}`,
    colors: Object.freeze({ frame, screen, off, on }),
  });
}

export type Appearance =
  { readonly palette: string } | { readonly palette: 'custom'; readonly colors: LcdColors };

export const CUSTOM_PALETTE_ID = 'custom';

const HEX6 = /^#[0-9a-f]{6}$/;

/** Verdadero solo para `#rrggbb` en minúsculas (forma canónica del formato). */
export function isCanonicalHexColor(value: unknown): value is string {
  return typeof value === 'string' && HEX6.test(value);
}

/** Acepta `#rgb` o `#rrggbb` (mayúsculas o minúsculas) y devuelve `#rrggbb`. */
export function normalizeHexColor(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLowerCase();
  if (/^#[0-9a-f]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return HEX6.test(v) ? v : undefined;
}

export function hexToRgb(hex: string): [number, number, number] {
  const n = normalizeHexColor(hex);
  if (!n) throw new Error(`Color no válido: ${hex}`);
  return [
    Number.parseInt(n.slice(1, 3), 16),
    Number.parseInt(n.slice(3, 5), 16),
    Number.parseInt(n.slice(5, 7), 16),
  ];
}

export function getPalette(id: string): Palette | undefined {
  return PALETTES.find((pal) => pal.id === id);
}

export function defaultAppearanceFor(kind: 'character' | 'graphic' | 'led-matrix'): Appearance {
  return { palette: kind === 'character' ? 'lm016l' : kind === 'led-matrix' ? 'led-red' : 'oled' };
}

/** Colores efectivos de una apariencia. */
export function resolveColors(appearance: Appearance): LcdColors {
  if ('colors' in appearance) return appearance.colors;
  return (getPalette(appearance.palette) ?? PALETTES[0]!).colors;
}

export function isValidAppearance(appearance: Appearance): boolean {
  if (appearance.palette === CUSTOM_PALETTE_ID) {
    if (!('colors' in appearance)) return false;
    const c = appearance.colors;
    return [c.frame, c.screen, c.off, c.on].every(isCanonicalHexColor);
  }
  return getPalette(appearance.palette) !== undefined && !('colors' in appearance);
}
