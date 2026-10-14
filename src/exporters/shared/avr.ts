import { ARDUINO_BOARDS, getArduinoBoard, type ArduinoBoard } from '../../device-profiles/mcu.ts';
import type { Diagnostic, OptionField } from '../types.ts';

/**
 * Validación de memoria para placas AVR.
 *
 * Huellas medidas compilando bocetos mínimos con arduino-cli 1.5.1,
 * arduino:avr 1.8.8, LiquidCrystal 1.0.7, LiquidCrystal I2C 1.1.2,
 * Adafruit SSD1306 2.5.17 + Adafruit GFX 1.12.6 y U8g2 2.36.19
 * (ver `docs/hardware-validation.md`). Incluyen el núcleo de Arduino.
 * `codeMargin` cubre el código de reproducción generado; las pruebas de
 * compilación comprueban que la estimación nunca queda por debajo del valor
 * real.
 */

export type LibraryId =
  'none' | 'liquidcrystal' | 'liquidcrystal-i2c' | 'adafruit-ssd1306' | 'u8g2-page';

interface Footprint {
  readonly flash: Readonly<Record<'ATmega328P' | 'ATmega2560', number>>;
  readonly ram: number;
}

const FOOTPRINTS: Readonly<Record<LibraryId, Footprint>> = {
  // Boceto vacío: solo el núcleo de Arduino (archivos .h sin código de pantalla).
  none: { flash: { ATmega328P: 444, ATmega2560: 662 }, ram: 9 },
  liquidcrystal: { flash: { ATmega328P: 1666, ATmega2560: 2300 }, ram: 53 },
  'liquidcrystal-i2c': { flash: { ATmega328P: 3150, ATmega2560: 3810 }, ram: 257 },
  'adafruit-ssd1306': { flash: { ATmega328P: 13128, ATmega2560: 13872 }, ram: 344 },
  'u8g2-page': { flash: { ATmega328P: 8324, ATmega2560: 9044 }, ram: 660 },
};

/** Código de reproducción generado (bucle, temporización, lecturas de tablas). */
export const CODE_MARGIN_BYTES = 1024;
/** RAM que se deja libre para la pila y variables locales. */
export const STACK_RESERVE_BYTES = 256;
/** Sobrecarga de `malloc` del búfer de Adafruit_SSD1306. */
const HEAP_OVERHEAD_BYTES = 8;

export const DEFAULT_BOARD_ID = 'arduino-uno';

export function boardField(): OptionField {
  return {
    kind: 'select',
    key: 'board',
    labelKey: 'export.option.board',
    choices: ARDUINO_BOARDS.map((b) => ({ value: b.id, labelKey: b.labelKey })),
    hintKey: 'export.hint.board',
  };
}

export function resolveBoard(id: unknown): ArduinoBoard {
  return getArduinoBoard(typeof id === 'string' ? id : '') ?? getArduinoBoard(DEFAULT_BOARD_ID)!;
}

export interface AvrUsage {
  /** Bytes en PROGMEM (flash, leídos con `pgm_read_*`). */
  readonly progmemBytes: number;
  /** Bytes de tablas en RAM (se copian desde la flash al arrancar). */
  readonly ramDataBytes: number;
  /** Mayor objeto individual en bytes. */
  readonly largestObjectBytes: number;
  /** RAM dinámica adicional (búfer de pantalla con `malloc`). */
  readonly heapBytes?: number;
}

export interface AvrEstimate {
  readonly flashBytes: number;
  readonly flashBudget: number;
  readonly ramBytes: number;
  readonly ramBudget: number;
}

export function estimateAvr(board: ArduinoBoard, library: LibraryId, usage: AvrUsage): AvrEstimate {
  const fp = FOOTPRINTS[library];
  const heap = usage.heapBytes ? usage.heapBytes + HEAP_OVERHEAD_BYTES : 0;
  return {
    flashBytes: fp.flash[board.mcu] + CODE_MARGIN_BYTES + usage.progmemBytes + usage.ramDataBytes,
    flashBudget: board.flashBytes,
    ramBytes: fp.ram + usage.ramDataBytes + heap + 64,
    ramBudget: board.ramBytes,
  };
}

/** Diagnósticos de memoria; los errores bloquean la exportación. */
export function validateAvr(
  board: ArduinoBoard,
  library: LibraryId,
  usage: AvrUsage,
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const est = estimateAvr(board, library, usage);
  if (usage.largestObjectBytes > board.maxObjectBytes) {
    out.push({
      severity: 'error',
      code: 'avr.objectTooLarge',
      params: { size: usage.largestObjectBytes, max: board.maxObjectBytes },
    });
  }
  // `pgm_read_*` usa punteros de 16 bits: las tablas deben quedar en los primeros 64 KiB.
  const nearLimit = board.nearProgmemBytes - FOOTPRINTS[library].flash[board.mcu];
  if (usage.progmemBytes > nearLimit) {
    out.push({
      severity: 'error',
      code: 'avr.progmemFar',
      params: { size: usage.progmemBytes, max: nearLimit },
    });
  }
  if (est.flashBytes > est.flashBudget) {
    out.push({
      severity: 'error',
      code: 'avr.flash',
      params: { used: est.flashBytes, max: est.flashBudget, board: `@${board.labelKey}` },
    });
  } else if (est.flashBytes > est.flashBudget * 0.9) {
    out.push({
      severity: 'warning',
      code: 'avr.flashNearLimit',
      params: { used: est.flashBytes, max: est.flashBudget },
    });
  }
  if (est.ramBytes + STACK_RESERVE_BYTES > est.ramBudget) {
    out.push({
      severity: 'error',
      code: 'avr.ram',
      params: {
        used: est.ramBytes,
        max: est.ramBudget - STACK_RESERVE_BYTES,
        board: `@${board.labelKey}`,
      },
    });
  } else if (est.ramBytes > est.ramBudget * 0.75) {
    out.push({
      severity: 'warning',
      code: 'avr.ramNearLimit',
      params: { used: est.ramBytes, max: est.ramBudget },
    });
  }
  return out;
}

/** Valida una lista de pines digitales para la placa. */
export function validatePins(
  board: ArduinoBoard,
  pins: readonly { readonly name: string; readonly value: number }[],
): Diagnostic[] {
  const out: Diagnostic[] = [];
  const seen = new Map<number, string>();
  for (const { name, value } of pins) {
    if (!Number.isInteger(value) || value < 0 || value >= board.digitalPinCount) {
      out.push({
        severity: 'error',
        code: 'pins.outOfRange',
        params: { pin: name, value: String(value), max: board.digitalPinCount - 1 },
      });
      continue;
    }
    const previous = seen.get(value);
    if (previous) {
      out.push({
        severity: 'error',
        code: 'pins.duplicate',
        params: { pin: name, other: previous, value },
      });
    }
    seen.set(value, name);
    if (board.serialPins.includes(value)) {
      out.push({ severity: 'warning', code: 'pins.serial', params: { pin: name, value } });
    }
  }
  return out;
}

export function formatI2c(address: number): string {
  return `0x${address.toString(16).toUpperCase().padStart(2, '0')}`;
}

/** Parte común de los bocetos: comprobación de arquitectura y parada sin ciclo ocupado. */
export const AVR_GUARD = `#if !defined(__AVR__)
#error "Este boceto se generó para placas AVR (Arduino Uno, Nano o Mega 2560)."
#endif
`;

export const HOLD_FUNCTION = `// Mantiene el último fotograma: la pantalla conserva su contenido y el
// microcontrolador se detiene en modo de bajo consumo, sin ciclo ocupado.
static void holdLastFrame() {
  set_sleep_mode(SLEEP_MODE_PWR_DOWN);
  cli();
  sleep_enable();
  sleep_cpu();
}
`;
