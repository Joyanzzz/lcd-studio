import { z } from './zod.ts';
import {
  getProfile,
  MAX7219_BRIGHTNESS_MAX,
  profileCanvasSize,
  type MatrixWiringId,
} from '../device-profiles/index.ts';
import { CUSTOM_PALETTE_ID, PALETTES, type Appearance } from './appearance.ts';
import { base64Length, decodeBase64, encodeBase64 } from './base64.ts';
import { defaultDevice, type DeviceConfig } from './device.ts';
import { packBits, packedLength, unpackBits } from './bitpack.ts';
import { fail, isAppError, issue, ok, type Issue, type Result } from './errors.ts';
import { LIMITS, projectMemoryBytes } from './limits.ts';
import { migrateV1 } from './migrate-v1.ts';
import { isValidProjectName } from './names.ts';
import { createFrame, LOOP_MODES, projectInvariantErrors, type Project } from './project.ts';

/**
 * Formato de proyecto `.lcdstudio.json`, versión de esquema 3.
 * La especificación completa está en `docs/file-format.md`.
 *
 * Historial del esquema (cada versión anterior se migra al abrirla; nunca se
 * pierde contenido):
 * - v1: prototipo de un solo archivo (`migrate-v1.ts`).
 * - v2: perfil, apariencia, ROM, reproducción y fotogramas.
 * - v3: añade `device` (conexión, destino de código y, en matrices de LEDs,
 *   orientación, cableado y brillo). Un v2 se abre con `device` sin
 *   configurar («solo diseño»).
 */

export const FORMAT_ID = 'lcd-studio-project';
export const SCHEMA_VERSION = 3;
export const PIXEL_ENCODING = 'bitpack-lsb-rowmajor';
export const PROJECT_EXTENSION = '.lcdstudio.json';

const hexColor = z.string().regex(/^#[0-9a-f]{6}$/);

const colorsSchema = z.strictObject({
  frame: hexColor,
  screen: hexColor,
  off: hexColor,
  on: hexColor,
});

const paletteIds = PALETTES.map((p) => p.id) as [string, ...string[]];

const appearanceSchema = z.union([
  z.strictObject({ palette: z.enum(paletteIds) }),
  z.strictObject({ palette: z.literal(CUSTOM_PALETTE_ID), colors: colorsSchema }),
]);

const frameSchema = z.strictObject({
  durationMs: z.number().int().min(LIMITS.frameDurationMinMs).max(LIMITS.frameDurationMaxMs),
  pixels: z.string().max(base64Length(packedLength(LIMITS.canvasMaxSide * LIMITS.canvasMaxSide))),
});

const v2Schema = z.strictObject({
  format: z.literal(FORMAT_ID),
  schemaVersion: z.literal(2),
  generator: z.strictObject({
    name: z.string().min(1).max(LIMITS.nameMaxLength),
    version: z.string().min(1).max(32),
  }),
  name: z
    .string()
    .min(1)
    .max(LIMITS.nameMaxLength * 2),
  profile: z.string().min(1).max(LIMITS.nameMaxLength),
  width: z.number().int().min(LIMITS.canvasMinSide).max(LIMITS.canvasMaxSide),
  height: z.number().int().min(LIMITS.canvasMinSide).max(LIMITS.canvasMaxSide),
  appearance: appearanceSchema,
  romCharset: z.enum(['none', 'hd44780-a00']),
  playback: z.strictObject({ loop: z.enum(LOOP_MODES as [string, ...string[]]) }),
  pixelEncoding: z.literal(PIXEL_ENCODING),
  frames: z.array(frameSchema).min(1).max(LIMITS.maxFrames),
});

const id = z.string().min(1).max(64);
const deviceSchema = z.strictObject({
  connection: id.nullable(),
  codeTarget: id.nullable(),
  matrix: z
    .strictObject({
      rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
      wiring: id,
      brightness: z.number().int().min(0).max(MAX7219_BRIGHTNESS_MAX),
    })
    .nullable(),
});

const v3Schema = v2Schema.extend({
  schemaVersion: z.literal(SCHEMA_VERSION),
  device: deviceSchema,
});

type DocV2 = z.infer<typeof v2Schema>;
type DocV3 = z.infer<typeof v3Schema>;

export interface Generator {
  readonly name: string;
  readonly version: string;
}

/** Serializa un proyecto a bytes UTF-8 deterministas. */
export function serializeProject(project: Project, generator: Generator): Uint8Array {
  const errors = projectInvariantErrors(project);
  if (errors.length > 0) throw new Error(`Proyecto inválido: ${errors.join(', ')}`);
  const appearance: Record<string, unknown> =
    'colors' in project.appearance
      ? {
          palette: CUSTOM_PALETTE_ID,
          colors: {
            frame: project.appearance.colors.frame,
            screen: project.appearance.colors.screen,
            off: project.appearance.colors.off,
            on: project.appearance.colors.on,
          },
        }
      : { palette: project.appearance.palette };
  const doc = {
    format: FORMAT_ID,
    schemaVersion: SCHEMA_VERSION,
    generator: { name: generator.name, version: generator.version },
    name: project.name,
    profile: project.profileId,
    width: project.width,
    height: project.height,
    appearance,
    romCharset: project.romCharset,
    device: {
      connection: project.device.connection,
      codeTarget: project.device.codeTarget,
      matrix: project.device.matrix
        ? {
            rotation: project.device.matrix.rotation,
            wiring: project.device.matrix.wiring,
            brightness: project.device.matrix.brightness,
          }
        : null,
    },
    playback: { loop: project.loopMode },
    pixelEncoding: PIXEL_ENCODING,
    frames: project.frames.map((f) => ({
      durationMs: f.durationMs,
      pixels: encodeBase64(packBits(f.pixels)),
    })),
  };
  return new TextEncoder().encode(`${JSON.stringify(doc, null, 2)}\n`);
}

export interface ParseOptions {
  /** Nombre del archivo, usado para nombrar proyectos v1 que no guardaban nombre. */
  readonly fileName?: string;
  /** Nombre si el archivo no lo indica (proyectos v1 sin nombre de archivo). */
  readonly defaultName?: string;
}

/**
 * Valida y convierte un archivo de proyecto. Es todo-o-nada: nunca devuelve
 * un proyecto parcial. No modifica ningún estado externo.
 */
export function parseProjectFile(bytes: Uint8Array, options: ParseOptions = {}): Result<Project> {
  if (bytes.length > LIMITS.projectMaxFileBytes) {
    return fail([issue('project.fileTooLarge', { max: LIMITS.projectMaxFileBytes })]);
  }
  if (bytes.length === 0) return fail([issue('project.empty')]);
  let text: string;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: false }).decode(bytes);
  } catch {
    return fail([issue('project.encoding')]);
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail([issue('project.json')]);
  }
  try {
    return parseProjectJson(json, options);
  } catch (error) {
    if (isAppError(error)) return fail([issue(error.code, { ...error.params })]);
    return fail([issue('project.invalid')]);
  }
}

export function parseProjectJson(json: unknown, options: ParseOptions = {}): Result<Project> {
  if (typeof json !== 'object' || json === null || Array.isArray(json)) {
    return fail([issue('project.notObject')]);
  }
  const record = json as Record<string, unknown>;
  if (record['format'] === FORMAT_ID) {
    const version = record['schemaVersion'];
    if (typeof version === 'number' && Number.isInteger(version) && version > SCHEMA_VERSION) {
      return fail([issue('project.newerVersion', { version })]);
    }
    if (version === 2) return parseDocument(record, 2);
    if (version !== SCHEMA_VERSION) return fail([issue('project.unknownVersion')]);
    return parseDocument(record, 3);
  }
  if (record['v'] === 1) return migrateV1(record, options.fileName, options.defaultName);
  return fail([issue('project.unknownFormat')]);
}

function zodIssues(error: z.ZodError): Issue[] {
  return error.issues
    .slice(0, 20)
    .map((i) =>
      issue('project.schema', { detail: i.code }, i.path.map((p) => String(p)).join('.')),
    );
}

function parseDocument(record: Record<string, unknown>, version: 2 | 3): Result<Project> {
  const rawFrames = record['frames'];
  if (Array.isArray(rawFrames) && rawFrames.length > LIMITS.maxFrames) {
    return fail([issue('project.tooManyFrames', { max: LIMITS.maxFrames }, 'frames')]);
  }
  const parsed = version === 2 ? v2Schema.safeParse(record) : v3Schema.safeParse(record);
  if (!parsed.success) return fail(zodIssues(parsed.error));
  const doc: DocV2 | DocV3 = parsed.data;

  const profile = getProfile(doc.profile);
  if (!profile) return fail([issue('project.unknownProfile', { profile: doc.profile }, 'profile')]);
  const size = profileCanvasSize(profile, { width: doc.width, height: doc.height });
  if (!size || size.width !== doc.width || size.height !== doc.height) {
    return fail([issue('project.sizeMismatch', { profile: profile.id }, 'width')]);
  }
  if (!isValidProjectName(doc.name)) return fail([issue('project.invalidName', {}, 'name')]);
  if (profile.kind !== 'character' && doc.romCharset !== 'none') {
    return fail([issue('project.invalidRom', {}, 'romCharset')]);
  }
  // Memoria esperada antes de reservar nada.
  projectMemoryBytes(doc.width, doc.height, doc.frames.length);

  const pixelCount = doc.width * doc.height;
  const expectedB64 = base64Length(packedLength(pixelCount));
  for (let i = 0; i < doc.frames.length; i++) {
    if (doc.frames[i]!.pixels.length !== expectedB64) {
      return fail([
        issue(
          'project.pixelLength',
          { frame: i + 1, expected: expectedB64, actual: doc.frames[i]!.pixels.length },
          `frames.${i}.pixels`,
        ),
      ]);
    }
  }
  const frames = [];
  for (let i = 0; i < doc.frames.length; i++) {
    const f = doc.frames[i]!;
    try {
      const pixels = unpackBits(decodeBase64(f.pixels), pixelCount);
      frames.push(createFrame(pixels, f.durationMs));
    } catch (error) {
      const code = isAppError(error) ? error.code : 'project.pixels';
      return fail([issue(code, { frame: i + 1 }, `frames.${i}.pixels`)]);
    }
  }
  const appearance: Appearance =
    'colors' in doc.appearance
      ? { palette: CUSTOM_PALETTE_ID, colors: { ...doc.appearance.colors } }
      : { palette: doc.appearance.palette };
  // v2 no guardaba la configuración del dispositivo: queda sin configurar.
  const device: DeviceConfig =
    'device' in doc
      ? Object.freeze({
          connection: doc.device.connection as DeviceConfig['connection'],
          codeTarget: doc.device.codeTarget,
          matrix: doc.device.matrix
            ? Object.freeze({
                rotation: doc.device.matrix.rotation,
                wiring: doc.device.matrix.wiring as MatrixWiringId,
                brightness: doc.device.matrix.brightness,
              })
            : null,
        })
      : defaultDevice(profile);
  const project: Project = Object.freeze({
    name: doc.name,
    profileId: profile.id,
    width: doc.width,
    height: doc.height,
    appearance,
    loopMode: doc.playback.loop as Project['loopMode'],
    romCharset: doc.romCharset,
    device,
    frames: Object.freeze(frames),
  });
  const errors = projectInvariantErrors(project);
  if (errors.length > 0) return fail(errors.map((code) => issue(code)));
  return ok(project, version === 2 ? [issue('migration.fromV2')] : []);
}
