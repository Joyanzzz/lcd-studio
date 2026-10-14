import { CHARACTER_PROFILES } from './character.ts';
import { GRAPHIC_PROFILES } from './graphic.ts';
import { LED_MATRIX_PROFILES } from './led-matrix.ts';
import type { DisplayProfile, RomCharset, RomCharsetId } from './types.ts';

export type {
  CharacterProfile,
  ContentModel,
  DisplayFamily,
  DisplayProfile,
  GraphicProfile,
  LedMatrixProfile,
  RomCharset,
  RomCharsetId,
} from './types.ts';
export { HD44780_DDRAM_LINES } from './character.ts';
export {
  MATRIX_ROTATIONS,
  MATRIX_WIRINGS,
  MAX7219_BRIGHTNESS_MAX,
  type MatrixRotation,
  type MatrixWiringId,
} from './led-matrix.ts';
export {
  connectionsFor,
  isConnectionFor,
  targetsFor,
  type CodeTarget,
  type ConnectionId,
  type ConnectionOption,
} from './capabilities.ts';

export const DISPLAY_PROFILES: readonly DisplayProfile[] = Object.freeze([
  ...CHARACTER_PROFILES,
  ...GRAPHIC_PROFILES,
  ...LED_MATRIX_PROFILES,
]);

const BY_ID = new Map<string, DisplayProfile>(DISPLAY_PROFILES.map((p) => [p.id, p]));

export const DEFAULT_PROFILE_ID = 'hd44780-16x2';

export function getProfile(id: string): DisplayProfile | undefined {
  return BY_ID.get(id);
}

/** Dimensiones del lienzo para un perfil; `custom` solo se usa si el perfil no fija tamaño. */
export function profileCanvasSize(
  profile: DisplayProfile,
  custom?: { width: number; height: number },
): { width: number; height: number } | undefined {
  if (profile.kind === 'character' || profile.kind === 'led-matrix')
    return { width: profile.width, height: profile.height };
  if (profile.fixedSize) return { ...profile.fixedSize };
  return custom ? { ...custom } : undefined;
}

export const ROM_CHARSETS: readonly RomCharset[] = Object.freeze([
  Object.freeze({ id: 'none', labelKey: 'rom.none', stability: 'stable' }),
  Object.freeze({ id: 'hd44780-a00', labelKey: 'rom.hd44780-a00', stability: 'experimental' }),
]);

export function getRomCharset(id: RomCharsetId): RomCharset {
  const found = ROM_CHARSETS.find((c) => c.id === id);
  if (!found) throw new Error(`ROM desconocida: ${id}`);
  return found;
}

export function isRomCharsetId(value: unknown): value is RomCharsetId {
  return ROM_CHARSETS.some((c) => c.id === value);
}
