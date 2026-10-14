import { CGRAM_SLOTS, planCharacterAnimation, type CharacterPlan } from '../../core/charlcd.ts';
import { getRomCharset, type CharacterProfile } from '../../device-profiles/index.ts';
import type { ArduinoBoard } from '../../device-profiles/mcu.ts';
import { estimateAvr, validateAvr, type LibraryId } from './avr.ts';
import { hex8, numberLines } from './c-source.ts';
import { selectedFrames, validateTextSize, type FrameScope } from './options.ts';
import type { Diagnostic, ExportContext } from '../types.ts';

/** Perfil de caracteres del contexto (lanza si no lo es). */
export function characterProfile(ctx: ExportContext): CharacterProfile {
  if (ctx.profile.kind !== 'character') throw new Error('Perfil no de caracteres');
  return ctx.profile;
}

export function buildPlan(ctx: ExportContext, scope: FrameScope): CharacterPlan {
  const profile = characterProfile(ctx);
  return planCharacterAnimation(
    ctx.project.frames,
    selectedFrames(ctx, scope),
    profile,
    ctx.project.romCharset,
  );
}

/** Errores de CGRAM (con las celdas exactas) y aviso de ROM experimental. */
export function cgramDiagnostics(ctx: ExportContext, plan: CharacterPlan): Diagnostic[] {
  const out: Diagnostic[] = [];
  for (const o of plan.overflow) {
    out.push({
      severity: 'error',
      code: 'cgram.overflow',
      params: {
        frame: o.frameIndex + 1,
        glyphs: o.glyphCount,
        max: CGRAM_SLOTS,
        cells: o.cells.length,
      },
      cells: o.cells.map((c) => ({ frame: o.frameIndex, row: c.row, col: c.col })),
    });
  }
  if (getRomCharset(ctx.project.romCharset).stability === 'experimental') {
    out.push({
      severity: 'warning',
      code: 'rom.experimental',
      params: { rom: ctx.project.romCharset },
    });
  }
  return out;
}

/** Tipo de índice de glifo: `uint8_t` hasta 255 glifos (0xFF = libre), si no `uint16_t`. */
export function glyphIndexType(poolSize: number): { type: string; none: string; wide: boolean } {
  return poolSize <= 0xff
    ? { type: 'uint8_t', none: '0xFF', wide: false }
    : { type: 'uint16_t', none: '0xFFFF', wide: true };
}

export interface CharTableSizes {
  readonly glyphs: number;
  readonly slots: number;
  readonly cells: number;
  readonly durations: number;
  readonly total: number;
  readonly largest: number;
}

export function charTableSizes(profile: CharacterProfile, plan: CharacterPlan): CharTableSizes {
  const frames = plan.frames.length;
  const glyphs = Math.max(1, plan.glyphPool.length) * 8;
  const slots = frames * CGRAM_SLOTS * (glyphIndexType(plan.glyphPool.length).wide ? 2 : 1);
  const cells = frames * profile.rows * profile.columns;
  const durations = frames * 2;
  return {
    glyphs,
    slots,
    cells,
    durations,
    total: glyphs + slots + cells + durations,
    largest: Math.max(glyphs, slots, cells, durations),
  };
}

export function charMemory(
  ctx: ExportContext,
  plan: CharacterPlan,
  board: ArduinoBoard,
  library: LibraryId,
  progmem: boolean,
) {
  const sizes = charTableSizes(characterProfile(ctx), plan);
  const usage = {
    progmemBytes: progmem ? sizes.total : 0,
    ramDataBytes: (progmem ? 0 : sizes.total) + CGRAM_SLOTS * 2 + 4,
    largestObjectBytes: sizes.largest,
  };
  return {
    sizes,
    usage,
    estimate: estimateAvr(board, library, usage),
    diagnostics: [
      ...validateAvr(board, library, usage),
      ...validateTextSize(sizes.total * 6 + 8192),
    ],
  };
}

const binary5 = (v: number) => `0b${v.toString(2).padStart(5, '0')}`;

/** Tablas C de la animación de caracteres. */
export function charTables(profile: CharacterProfile, plan: CharacterPlan, attr: string): string {
  const idx = glyphIndexType(plan.glyphPool.length);
  const pool = plan.glyphPool.length > 0 ? plan.glyphPool : [new Uint8Array(8)];
  const a = attr ? ` ${attr}` : '';
  const glyphs = pool
    .map(
      (g, i) =>
        `  { ${Array.from(g).map(binary5).join(', ')} }${i < pool.length - 1 ? ',' : ''} // ${i}`,
    )
    .join('\n');
  const slots = plan.frames
    .map((f) => {
      const values = Array.from(f.slots).map((s) => (s < 0 ? idx.none : String(s)));
      return `  { ${values.join(', ')} }`;
    })
    .join(',\n');
  const cells = plan.frames
    .map((f) => {
      const rows: string[] = [];
      for (let r = 0; r < profile.rows; r++) {
        const codes = Array.from(f.cells.subarray(r * profile.columns, (r + 1) * profile.columns));
        rows.push(`    { ${codes.map(hex8).join(', ')} }`);
      }
      return `  { // fotograma ${f.frameIndex + 1}\n${rows.join(',\n')}\n  }`;
    })
    .join(',\n');
  return `${plan.glyphPool.length === 0 ? '// Ningún fotograma usa caracteres propios; la tabla contiene un glifo vacío sin uso.\n' : ''}// Banco de caracteres propios: 8 filas de 5 bits (bit 4 = columna izquierda).
static const uint8_t GLYPHS[GLYPH_COUNT][8]${a} = {
${glyphs}
};

// Ranuras CGRAM 0-7 de cada fotograma: índice en GLYPHS o NO_GLYPH (sin cambios).
static const glyph_index_t FRAME_SLOTS[FRAME_COUNT][8]${a} = {
${slots}
};

// Código de cada celda: 0x00-0x07 = ranura CGRAM, 0x20 = espacio, otros = ROM.
static const uint8_t FRAME_CELLS[FRAME_COUNT][LCD_ROWS][LCD_COLUMNS]${a} = {
${cells}
};
`;
}

export interface CharSketchParts {
  readonly constants: string;
  readonly tables: string;
  readonly reader: string;
  readonly showFrame: string;
}

/** Partes del boceto independientes de la biblioteca (el objeto se llama `lcd`). */
export function charSketchParts(
  ctx: ExportContext,
  plan: CharacterPlan,
  progmem: boolean,
): CharSketchParts {
  const profile = characterProfile(ctx);
  const idx = glyphIndexType(plan.glyphPool.length);
  const attr = progmem ? 'PROGMEM' : '';
  const a = attr ? ` ${attr}` : '';
  const durations = plan.frames.map((f) => ctx.project.frames[f.frameIndex]!.durationMs);
  const constants = `static const uint8_t LCD_COLUMNS = ${profile.columns};
static const uint8_t LCD_ROWS = ${profile.rows};
// Dirección DDRAM del inicio de cada fila (${profile.id}, ${profile.ddramSource}).
// Se usa directamente con lcd.command(0x80 | dirección) en lugar de setCursor(),
// cuyas tablas internas varían entre bibliotecas.
static const uint8_t ROW_ADDRESS[LCD_ROWS] = { ${profile.ddramRowAddresses.map(hex8).join(', ')} };
static const uint16_t FRAME_COUNT = ${plan.frames.length};
static const uint16_t GLYPH_COUNT = ${Math.max(1, plan.glyphPool.length)};
typedef ${idx.type} glyph_index_t;
static const glyph_index_t NO_GLYPH = ${idx.none};
`;
  const tables = `${charTables(profile, plan, attr)}
static const uint16_t FRAME_DURATIONS_MS[FRAME_COUNT]${a} = {
${numberLines(durations, '  ')}
};
`;
  const readSlot = progmem
    ? idx.wide
      ? 'pgm_read_word(&FRAME_SLOTS[index][slot])'
      : 'pgm_read_byte(&FRAME_SLOTS[index][slot])'
    : 'FRAME_SLOTS[index][slot]';
  const readCell = progmem
    ? 'pgm_read_byte(&FRAME_CELLS[index][row][col])'
    : 'FRAME_CELLS[index][row][col]';
  const copy = progmem ? 'memcpy_P(rows, GLYPHS[glyph], 8);' : 'memcpy(rows, GLYPHS[glyph], 8);';
  const reader = `static uint16_t frameDurationMs(uint16_t index) {
  return ${progmem ? 'pgm_read_word(&FRAME_DURATIONS_MS[index])' : 'FRAME_DURATIONS_MS[index]'};
}
`;
  const showFrame = `// Glifo cargado en cada ranura CGRAM del LCD.
static glyph_index_t loadedSlots[8] = { NO_GLYPH, NO_GLYPH, NO_GLYPH, NO_GLYPH, NO_GLYPH, NO_GLYPH, NO_GLYPH, NO_GLYPH };

static void showFrame(uint16_t index) {
  uint8_t rows[8];
  // 1. Carga solo las ranuras CGRAM que cambian respecto a lo ya cargado.
  for (uint8_t slot = 0; slot < 8; slot++) {
    const glyph_index_t glyph = ${readSlot};
    if (glyph == NO_GLYPH || glyph == loadedSlots[slot]) {
      continue;
    }
    ${copy}
    lcd.createChar(slot, rows);
    loadedSlots[slot] = glyph;
  }
  // 2. Escribe todas las celdas fila a fila en su dirección DDRAM.
  for (uint8_t row = 0; row < LCD_ROWS; row++) {
    lcd.command(0x80 | ROW_ADDRESS[row]);
    for (uint8_t col = 0; col < LCD_COLUMNS; col++) {
      lcd.write((uint8_t)${readCell});
    }
  }
}
`;
  return { constants, tables, reader, showFrame };
}
