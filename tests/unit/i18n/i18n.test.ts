import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PALETTES } from '../../../src/core/appearance.ts';
import { LOOP_MODES } from '../../../src/core/project.ts';
import { DISPLAY_PROFILES, ROM_CHARSETS } from '../../../src/device-profiles/index.ts';
import { ARDUINO_BOARDS, PIC_DEVICES } from '../../../src/device-profiles/mcu.ts';
import { DITHER_MODES, FIT_MODES } from '../../../src/engine/image/params.ts';
import { EXPORTERS } from '../../../src/exporters/index.ts';
import { en } from '../../../src/ui/i18n/en.ts';
import { es } from '../../../src/ui/i18n/es.ts';
import {
  createTranslator,
  detectSystemLocale,
  isLocale,
  LOCALES,
  placeholders,
  type Dictionary,
} from '../../../src/ui/i18n/translate.ts';
import { ctxFor, makeProject } from '../../helpers/projects.ts';

const DICTIONARIES: Record<string, Dictionary> = { es, en };

/** Claves que el núcleo y los exportadores generan, recogidas en tiempo de ejecución. */
function runtimeKeys(): Set<string> {
  const keys = new Set<string>();
  for (const p of DISPLAY_PROFILES) keys.add(p.labelKey);
  for (const p of PALETTES) keys.add(p.labelKey);
  keys.add('palette.custom');
  for (const b of ARDUINO_BOARDS) keys.add(b.labelKey);
  for (const d of PIC_DEVICES) keys.add(d.labelKey);
  for (const r of ROM_CHARSETS) keys.add(r.labelKey);
  for (const m of LOOP_MODES) keys.add(`loop.${m}`);
  for (const m of DITHER_MODES) keys.add(`image.dither.${m}`);
  for (const m of FIT_MODES) keys.add(`image.fit.${m}`);
  for (const e of EXPORTERS) {
    keys.add(e.labelKey);
    keys.add(e.descriptionKey);
    keys.add(`export.orientation.${e.orientation}`);
    keys.add(`export.bitOrder.${e.bitOrder}`);
    for (const c of e.constraintKeys) keys.add(c);
    for (const profile of DISPLAY_PROFILES.filter((p) => e.supports(p))) {
      const size = profile.kind === 'graphic' && !profile.fixedSize ? { width: 16, height: 8 } : {};
      const ctx = ctxFor(
        makeProject(
          profile.id,
          [
            {
              pixels: new Uint8Array(
                profile.kind !== 'graphic'
                  ? profile.width * profile.height
                  : 'width' in size
                    ? 128
                    : (profile.fixedSize?.width ?? 0) * (profile.fixedSize?.height ?? 0),
              ),
            },
          ],
          size,
        ),
      );
      const variants = [{}, { sketch: true, bus: '8', progmem: false }];
      for (const raw of variants) {
        const options = e.normalize(raw, ctx);
        for (const f of e.fields(ctx, options)) {
          keys.add(f.labelKey);
          if (f.hintKey) keys.add(f.hintKey);
          if (f.kind === 'select')
            for (const c of f.choices) if (!c.labelKey.startsWith('literal:')) keys.add(c.labelKey);
        }
        for (const d of e.validate(ctx, options)) keys.add(d.code);
      }
    }
  }
  return keys;
}

/** Literales de clave escritos en el código fuente (fuera de los diccionarios). */
function sourceKeys(): Set<string> {
  const ns = [
    'limits',
    'bitmap',
    'bitpack',
    'base64',
    'zip',
    'project',
    'migration',
    'image',
    'task',
    'avr',
    'pins',
    'export',
    'cgram',
    'rom',
    'i2c',
    'xc8',
    'gif',
    'binary',
    'constraint',
    'exporter',
    'unit',
    'app',
    'title',
    'save',
    'toolbar',
    'language',
    'tools',
    'tool',
    'view',
    'canvas',
    'status',
    'panels',
    'panel',
    'mobile',
    'draw',
    'loop',
    'timeline',
    'dialog',
    'shortcut',
    'toast',
    'profile',
    'palette',
    'board',
    'pic',
    'history',
    'platform',
    'key',
  ];
  const re = new RegExp(`['"\`](?:@)?((?:${ns.join('|')})\\.[A-Za-z0-9.-]+)['"\`]`, 'g');
  const keys = new Set<string>();
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (!path.endsWith(join('ui', 'i18n'))) walk(path);
      } else if (/\.(ts|tsx)$/.test(name)) {
        const text = readFileSync(path, 'utf8');
        for (const m of text.matchAll(re)) {
          const key = m[1]!;
          // Nombres de archivo y prefijos dinámicos no son claves.
          if (/\.(ts|tsx|json|png|gif|ino|h|c)$/.test(key) || key.endsWith('.')) continue;
          keys.add(key);
        }
      }
    }
  };
  walk('src');
  return keys;
}

describe('diccionarios', () => {
  it('español e inglés tienen exactamente las mismas claves', () => {
    const esKeys = Object.keys(es).sort();
    const enKeys = Object.keys(en).sort();
    expect(enKeys.filter((k) => !(k in es))).toEqual([]);
    expect(esKeys.filter((k) => !(k in en))).toEqual([]);
  });

  it('cada traducción usa los mismos marcadores {x}', () => {
    const mismatched = Object.keys(es).filter(
      (k) =>
        placeholders(es[k as keyof typeof es]).join() !==
        placeholders(en[k as keyof typeof en]).join(),
    );
    expect(mismatched).toEqual([]);
  });

  it('no hay mensajes vacíos ni sin traducir', () => {
    for (const [lang, dict] of Object.entries(DICTIONARIES)) {
      for (const [key, value] of Object.entries(dict)) {
        expect(value.trim().length, `${lang}:${key}`).toBeGreaterThan(0);
      }
    }
    // Textos idénticos en ambos idiomas por ser nombres propios o palabras iguales.
    const SAME_IN_BOTH = new Set([
      'app.name',
      'save.status.error',
      'tool.withKey',
      'view.zoom',
      'status.size',
      'status.charSize',
      'status.cgram',
      'panels.show',
      'timeline.ms',
      'image.source',
      'image.fit.original',
      'image.rotation.value',
      'export.experimentalBadge',
      'export.bus.4',
      'export.bus.8',
      'export.layout.horizontal',
      'export.layout.vertical',
      'profile.pcd8544-84x48',
      'toast.error',
      'unit.bytes',
    ]);
    const identical = Object.keys(es).filter((k) => {
      const a = es[k as keyof typeof es];
      return (
        a === en[k as keyof typeof en] &&
        !SAME_IN_BOTH.has(k) &&
        /[a-záéíóúñ]{4,}/i.test(a) &&
        !/^(PNG|ASCII art|PIC|KS0108|HD44780|Arduino|Floyd|Atkinson|Sierra|Bayer|Gamma|Español|English|PCF8574|0x)/.test(
          a,
        )
      );
    });
    expect(identical).toEqual([]);
  });

  it('todas las claves generadas por el núcleo y los exportadores existen en ambos idiomas', () => {
    const missing: string[] = [];
    for (const key of runtimeKeys()) {
      for (const [lang, dict] of Object.entries(DICTIONARIES))
        if (!(key in dict)) missing.push(`${lang}:${key}`);
    }
    expect(missing).toEqual([]);
  });

  it('todas las claves escritas en el código existen en ambos idiomas', () => {
    const missing: string[] = [];
    for (const key of sourceKeys()) {
      for (const [lang, dict] of Object.entries(DICTIONARIES))
        if (!(key in dict)) missing.push(`${lang}:${key}`);
    }
    expect(missing).toEqual([]);
  });
});

describe.each(LOCALES)('traductor (%s)', (locale) => {
  const tr = createTranslator(locale, DICTIONARIES[locale]!);

  it('interpola parámetros y formatea números por idioma', () => {
    const msg = tr.t('avr.flash', { used: 32_500, max: 32_256, board: '@board.arduino-uno' });
    expect(msg).toContain('Arduino Uno');
    expect(msg).toContain(locale === 'es' ? '32.500' : '32,500');
    expect(msg).not.toMatch(/\{|\}/);
  });

  it('muestra literales y devuelve la clave si falta', () => {
    expect(tr.t('literal:0x3C')).toBe('0x3C');
    expect(tr.t('no.existe')).toBe('no.existe');
    expect(tr.has('menu.file')).toBe(true);
    expect(tr.t('toolbar.undo.tip')).toContain('{action}');
    expect(tr.formatNumber(1234.5)).toBe(locale === 'es' ? '1234,5' : '1,234.5');
  });
});

describe('detección de idioma', () => {
  it('usa la primera preferencia admitida y español por omisión', () => {
    expect(detectSystemLocale(['en-US', 'es-ES'])).toBe('en');
    expect(detectSystemLocale(['fr-FR', 'es-MX'])).toBe('es');
    expect(detectSystemLocale(['de-DE'])).toBe('es');
    expect(detectSystemLocale([])).toBe('es');
    expect(detectSystemLocale(['EN_gb'])).toBe('en');
    expect(isLocale('en')).toBe(true);
    expect(isLocale('fr')).toBe(false);
  });

  it('usa el diccionario de reserva', () => {
    const tr = createTranslator('en', {}, { a: 'b' });
    expect(tr.t('a')).toBe('b');
  });
});
