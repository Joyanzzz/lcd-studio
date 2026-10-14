import { z } from 'zod';
import { getProfile } from '../device-profiles/index.ts';
import { CUSTOM_PALETTE_ID, normalizeHexColor, type Appearance } from './appearance.ts';
import { defaultDevice } from './device.ts';
import { decodeBase64 } from './base64.ts';
import { unpackBits } from './bitpack.ts';
import { fail, isAppError, issue, ok, type Issue, type Result } from './errors.ts';
import { LIMITS, projectMemoryBytes } from './limits.ts';
import { sanitizeProjectName } from './names.ts';
import { createFrame, projectInvariantErrors, type Frame, type Project } from './project.ts';

/**
 * Migración del formato v1 generado por el prototipo:
 *
 * ```json
 * { "v": 1, "preset": "lm016l",
 *   "disp": { "kind": "char", "cols": 16, "rows": 2, "w": 80, "h": 16 },
 *   "theme": "lm016l",
 *   "custom": { "label": "…", "frame": "#…", "screen": "#…", "off": "#…", "on": "#…", "flat": false },
 *   "frames": [ { "d": 200, "b": "<base64 de bits LSB primero>" } ] }
 * ```
 */

const int = z.number().int();

const v1CharDisp = z.strictObject({
  kind: z.literal('char'),
  cols: int.min(1).max(64),
  rows: int.min(1).max(16),
  w: int.min(1).max(LIMITS.canvasMaxSide),
  h: int.min(1).max(LIMITS.canvasMaxSide),
});

const v1GfxDisp = z.strictObject({
  kind: z.literal('gfx'),
  w: int.min(1).max(LIMITS.canvasMaxSide),
  h: int.min(1).max(LIMITS.canvasMaxSide),
});

const v1Custom = z.strictObject({
  label: z.string().max(64).optional(),
  frame: z.string().max(16),
  screen: z.string().max(16),
  off: z.string().max(16),
  on: z.string().max(16),
  flat: z.boolean().optional(),
});

const v1Schema = z.strictObject({
  v: z.literal(1),
  preset: z.string().max(32),
  disp: z.discriminatedUnion('kind', [v1CharDisp, v1GfxDisp]),
  theme: z.string().max(32),
  custom: v1Custom.optional(),
  frames: z
    .array(
      z.strictObject({
        // El prototipo cargaba `d || 200`, así que se admite 0 como "sin duración".
        d: z.number().int().min(0).max(LIMITS.frameDurationMaxMs),
        b: z.string().max(65_536),
      }),
    )
    .min(1),
});

/** Equivalencias de temas del prototipo. */
const THEME_MAP: Readonly<Record<string, string>> = {
  lm016l: 'lm016l',
  red: 'red',
  yellow: 'yellow',
  blue: 'blue',
  green: 'green',
  paper: 'paper',
  oled: 'oled',
  oledb: 'oled-blue',
  amber: 'amber',
};

/** Pantallas de caracteres del prototipo con perfil verificado. */
const CHAR_PROFILE_MAP: Readonly<Record<string, string>> = {
  '16x2': 'hd44780-16x2',
  '20x2': 'hd44780-20x2',
  '16x4': 'hd44780-16x4',
  '20x4': 'hd44780-20x4',
};

/** Presets gráficos del prototipo que nombraban explícitamente el controlador. */
const GFX_PRESET_MAP: Readonly<Record<string, string>> = {
  g84x48: 'pcd8544-84x48',
};

export function migrateV1(
  record: Record<string, unknown>,
  fileName?: string,
  defaultName = 'proyecto migrado',
): Result<Project> {
  const rawFrames = record['frames'];
  if (Array.isArray(rawFrames) && rawFrames.length > LIMITS.maxFrames) {
    return fail([issue('project.tooManyFrames', { max: LIMITS.maxFrames }, 'frames')]);
  }
  const parsed = v1Schema.safeParse(record);
  if (!parsed.success) {
    return fail(
      parsed.error.issues
        .slice(0, 20)
        .map((i) =>
          issue('project.v1Schema', { detail: i.code }, i.path.map((p) => String(p)).join('.')),
        ),
    );
  }
  const doc = parsed.data;
  const warnings: Issue[] = [];

  // Perfil y dimensiones.
  let profileId: string;
  const width = doc.disp.w;
  const height = doc.disp.h;
  if (doc.disp.kind === 'char') {
    if (doc.disp.w !== doc.disp.cols * 5 || doc.disp.h !== doc.disp.rows * 8) {
      return fail([issue('project.sizeMismatch', { profile: 'v1' }, 'disp')]);
    }
    const mapped = CHAR_PROFILE_MAP[`${doc.disp.cols}x${doc.disp.rows}`];
    if (mapped) {
      profileId = mapped;
    } else {
      profileId = 'graphic-custom';
      warnings.push(
        issue('migration.charProfileUnsupported', {
          cols: doc.disp.cols,
          rows: doc.disp.rows,
        }),
      );
    }
  } else {
    const mapped = GFX_PRESET_MAP[doc.preset];
    const fixed = mapped ? getProfile(mapped) : undefined;
    if (
      fixed &&
      fixed.kind === 'graphic' &&
      fixed.fixedSize?.width === width &&
      fixed.fixedSize.height === height
    ) {
      profileId = fixed.id;
    } else {
      profileId = 'graphic-custom';
    }
  }

  projectMemoryBytes(width, height, doc.frames.length);

  // Apariencia.
  let appearance: Appearance;
  if (doc.theme === 'custom') {
    if (!doc.custom) return fail([issue('project.invalidAppearance', {}, 'custom')]);
    const colors = {
      frame: normalizeHexColor(doc.custom.frame),
      screen: normalizeHexColor(doc.custom.screen),
      off: normalizeHexColor(doc.custom.off),
      on: normalizeHexColor(doc.custom.on),
    };
    if (!colors.frame || !colors.screen || !colors.off || !colors.on) {
      return fail([issue('project.invalidAppearance', {}, 'custom')]);
    }
    appearance = {
      palette: CUSTOM_PALETTE_ID,
      colors: { frame: colors.frame, screen: colors.screen, off: colors.off, on: colors.on },
    };
  } else {
    const palette = THEME_MAP[doc.theme];
    if (palette) {
      appearance = { palette };
    } else {
      appearance = { palette: doc.disp.kind === 'char' ? 'lm016l' : 'oled' };
      warnings.push(issue('migration.unknownTheme', { theme: doc.theme }));
    }
  }

  // Fotogramas.
  const pixelCount = width * height;
  const frames: Frame[] = [];
  let clampedShort = 0;
  let defaulted = 0;
  for (let i = 0; i < doc.frames.length; i++) {
    const f = doc.frames[i]!;
    let duration = f.d;
    if (duration === 0) {
      duration = LIMITS.frameDurationDefaultMs;
      defaulted++;
    } else if (duration < LIMITS.frameDurationMinMs) {
      duration = LIMITS.frameDurationMinMs;
      clampedShort++;
    }
    try {
      frames.push(createFrame(unpackBits(decodeBase64(f.b), pixelCount), duration));
    } catch (error) {
      const code = isAppError(error) ? error.code : 'project.pixels';
      return fail([issue(code, { frame: i + 1 }, `frames.${i}.b`)]);
    }
  }
  if (clampedShort > 0) {
    warnings.push(
      issue('migration.durationClamped', { count: clampedShort, min: LIMITS.frameDurationMinMs }),
    );
  }
  if (defaulted > 0) {
    warnings.push(
      issue('migration.durationDefaulted', {
        count: defaulted,
        value: LIMITS.frameDurationDefaultMs,
      }),
    );
  }

  const baseName = (fileName ?? '').replace(/\.lcdstudio\.json$|\.json$/i, '');
  const project: Project = Object.freeze({
    name: sanitizeProjectName(baseName, sanitizeProjectName(defaultName)),
    profileId,
    width,
    height,
    appearance,
    loopMode: 'loop',
    romCharset: 'none',
    device: defaultDevice(getProfile(profileId)!),
    frames: Object.freeze(frames),
  });
  const errors = projectInvariantErrors(project);
  if (errors.length > 0) return fail(errors.map((code) => issue(code)));
  warnings.unshift(issue('migration.fromV1'));
  return ok(project, warnings);
}
