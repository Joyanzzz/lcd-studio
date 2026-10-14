import { describe, expect, it } from 'vitest';
import {
  CUSTOM_PALETTE_ID,
  PALETTES,
  defaultAppearanceFor,
  getPalette,
  hexToRgb,
  isCanonicalHexColor,
  isValidAppearance,
  normalizeHexColor,
  resolveColors,
} from '../../../src/core/appearance.ts';
import {
  DEFAULT_PROFILE_ID,
  DISPLAY_PROFILES,
  getProfile,
  getRomCharset,
  HD44780_DDRAM_LINES,
  isRomCharsetId,
  profileCanvasSize,
  ROM_CHARSETS,
  type CharacterProfile,
  type GraphicProfile,
} from '../../../src/device-profiles/index.ts';
import {
  ARDUINO_BOARDS,
  getArduinoBoard,
  getPicDevice,
  PIC_DEVICES,
} from '../../../src/device-profiles/mcu.ts';
import { HD44780_A00, a00GlyphRows7 } from '../../../src/device-profiles/rom/hd44780-a00.ts';
import { contrastRatio } from '../../helpers/decode.ts';

const charProfiles = DISPLAY_PROFILES.filter((p): p is CharacterProfile => p.kind === 'character');

describe('perfiles de caracteres', () => {
  it('incluye solo los cuatro perfiles HD44780 verificables', () => {
    expect(charProfiles.map((p) => p.id)).toEqual([
      'hd44780-16x2',
      'hd44780-20x2',
      'hd44780-16x4',
      'hd44780-20x4',
    ]);
  });

  it.each(charProfiles.map((p) => [p.id, p] as const))(
    '%s: DDRAM dentro del rango del controlador y sin solapamiento',
    (_id, profile: CharacterProfile) => {
      expect(profile.rows).toBeLessThanOrEqual(4);
      expect(profile.ddramRowAddresses).toHaveLength(profile.rows);
      expect(profile.cgramSlots).toBe(8);
      expect([profile.cellWidth, profile.cellHeight]).toEqual([5, 8]);
      expect(profile.width).toBe(profile.columns * 5);
      expect(profile.height).toBe(profile.rows * 8);
      const used = new Set<number>();
      for (const start of profile.ddramRowAddresses) {
        const end = start + profile.columns - 1;
        const line = HD44780_DDRAM_LINES.find(([lo, hi]) => start >= lo && end <= hi);
        expect(line, `fila en 0x${start.toString(16)}`).toBeDefined();
        for (let a = start; a <= end; a++) {
          expect(used.has(a)).toBe(false);
          used.add(a);
        }
      }
      expect(profile.romCharsets).toContain('none');
    },
  );

  it('usa los mapas DDRAM documentados', () => {
    const map = Object.fromEntries(charProfiles.map((p) => [p.id, p.ddramRowAddresses]));
    expect(map).toEqual({
      'hd44780-16x2': [0x00, 0x40],
      'hd44780-20x2': [0x00, 0x40],
      'hd44780-16x4': [0x00, 0x40, 0x10, 0x50],
      'hd44780-20x4': [0x00, 0x40, 0x14, 0x54],
    });
  });
});

describe('perfiles gráficos', () => {
  it('tienen identificadores únicos y tamaños válidos', () => {
    const ids = DISPLAY_PROFILES.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const p of DISPLAY_PROFILES.filter((p): p is GraphicProfile => p.kind === 'graphic')) {
      if (p.fixedSize) {
        expect(p.fixedSize.width).toBeLessThanOrEqual(512);
        expect(p.fixedSize.height).toBeLessThanOrEqual(512);
        expect(profileCanvasSize(p, { width: 1, height: 1 })).toEqual(p.fixedSize);
      } else {
        expect(profileCanvasSize(p)).toBeUndefined();
        expect(profileCanvasSize(p, { width: 3, height: 4 })).toEqual({ width: 3, height: 4 });
      }
    }
    expect(getProfile('ssd1306-128x64')?.kind).toBe('graphic');
    expect(getProfile('nada')).toBeUndefined();
    expect(getProfile(DEFAULT_PROFILE_ID)).toBeDefined();
    expect(profileCanvasSize(getProfile('hd44780-16x4')!)).toEqual({ width: 80, height: 32 });
  });
});

describe('ROM y placas', () => {
  it('declara la ROM A00 como experimental', () => {
    expect(getRomCharset('hd44780-a00').stability).toBe('experimental');
    expect(getRomCharset('none').stability).toBe('stable');
    expect(() => getRomCharset('x' as never)).toThrow();
    expect(isRomCharsetId('none')).toBe(true);
    expect(isRomCharsetId('a02')).toBe(false);
    expect(ROM_CHARSETS).toHaveLength(2);
  });

  it('la tabla A00 tiene glifos de 5×8 con la fila del cursor vacía', () => {
    expect(HD44780_A00.size).toBe(97);
    for (const [code, rows] of HD44780_A00) {
      expect(rows).toHaveLength(8);
      for (const r of rows) expect(r).toBeLessThan(32);
      if (code !== 0xff) expect(rows[7]).toBe(0);
    }
    expect(a00GlyphRows7(0x41)).toHaveLength(7);
    expect(a00GlyphRows7(0x80)).toBeUndefined();
  });

  it('describe placas Arduino con límites coherentes', () => {
    for (const b of ARDUINO_BOARDS) {
      expect(b.flashBytes).toBeGreaterThan(0);
      expect(b.ramBytes).toBeGreaterThan(0);
      expect(b.i2cPins[0]).toBeLessThan(b.digitalPinCount);
      expect(getArduinoBoard(b.id)).toBe(b);
    }
    expect(getArduinoBoard('esp32')).toBeUndefined();
    for (const d of PIC_DEVICES) expect(getPicDevice(d.id)).toBe(d);
    expect(getPicDevice('pic12')).toBeUndefined();
  });
});

describe('apariencia', () => {
  it('normaliza y valida colores', () => {
    expect(normalizeHexColor('#ABC')).toBe('#aabbcc');
    expect(normalizeHexColor(' #A0B1C2 ')).toBe('#a0b1c2');
    expect(normalizeHexColor('red')).toBeUndefined();
    expect(normalizeHexColor(3)).toBeUndefined();
    expect(isCanonicalHexColor('#a0b1c2')).toBe(true);
    expect(isCanonicalHexColor('#A0B1C2')).toBe(false);
    expect(hexToRgb('#ff8000')).toEqual([255, 128, 0]);
    expect(() => hexToRgb('nope')).toThrow();
  });

  it('resuelve paletas y valida apariencias', () => {
    for (const p of PALETTES) {
      expect(isValidAppearance({ palette: p.id })).toBe(true);
      expect(Object.values(p.colors).every(isCanonicalHexColor)).toBe(true);
      // El píxel encendido debe distinguirse del apagado.
      expect(contrastRatio(p.colors.on, p.colors.off)).toBeGreaterThan(3);
    }
    expect(getPalette('lm016l')?.id).toBe('lm016l');
    expect(resolveColors({ palette: 'zzz' })).toEqual(PALETTES[0]!.colors);
    const colors = { frame: '#000000', screen: '#111111', off: '#222222', on: '#ffffff' };
    expect(resolveColors({ palette: CUSTOM_PALETTE_ID, colors })).toBe(colors);
    expect(isValidAppearance({ palette: CUSTOM_PALETTE_ID } as never)).toBe(false);
    expect(defaultAppearanceFor('graphic')).toEqual({ palette: 'oled' });
    expect(contrastRatio('#000000', '#ffffff')).toBeCloseTo(21, 0);
  });
});
