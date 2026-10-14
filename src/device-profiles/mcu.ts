/**
 * Placas y microcontroladores de destino para los exportadores de código.
 *
 * Los tamaños de flash/RAM son los límites que aplica el núcleo `arduino:avr`
 * (`upload.maximum_size` y `upload.maximum_data_size` de `boards.txt`), es
 * decir, ya descuentan el gestor de arranque.
 */

export interface ArduinoBoard {
  readonly id: 'arduino-uno' | 'arduino-nano' | 'arduino-mega2560';
  readonly labelKey: string;
  /** Nombre completo de la placa para `arduino-cli`. */
  readonly fqbn: string;
  readonly mcu: 'ATmega328P' | 'ATmega2560';
  readonly flashBytes: number;
  readonly ramBytes: number;
  /** Pines digitales válidos: 0 … digitalPinCount-1. */
  readonly digitalPinCount: number;
  /** Pines del puerto serie de hardware usado para programar la placa. */
  readonly serialPins: readonly number[];
  /** Pines SDA y SCL del bus I²C de hardware. */
  readonly i2cPins: readonly [number, number];
  /** Bytes de flash alcanzables con `pgm_read_*` (punteros de 16 bits). */
  readonly nearProgmemBytes: number;
  /** Tamaño máximo de un objeto individual en avr-gcc (`PTRDIFF_MAX`). */
  readonly maxObjectBytes: number;
}

export const ARDUINO_BOARDS: readonly ArduinoBoard[] = Object.freeze([
  Object.freeze({
    id: 'arduino-uno',
    labelKey: 'board.arduino-uno',
    fqbn: 'arduino:avr:uno',
    mcu: 'ATmega328P',
    flashBytes: 32_256,
    ramBytes: 2_048,
    digitalPinCount: 20,
    serialPins: Object.freeze([0, 1]),
    i2cPins: Object.freeze([18, 19]) as readonly [number, number],
    nearProgmemBytes: 65_536,
    maxObjectBytes: 32_767,
  }),
  Object.freeze({
    id: 'arduino-nano',
    labelKey: 'board.arduino-nano',
    fqbn: 'arduino:avr:nano:cpu=atmega328',
    mcu: 'ATmega328P',
    flashBytes: 30_720,
    ramBytes: 2_048,
    digitalPinCount: 20,
    serialPins: Object.freeze([0, 1]),
    i2cPins: Object.freeze([18, 19]) as readonly [number, number],
    nearProgmemBytes: 65_536,
    maxObjectBytes: 32_767,
  }),
  Object.freeze({
    id: 'arduino-mega2560',
    labelKey: 'board.arduino-mega2560',
    fqbn: 'arduino:avr:mega:cpu=atmega2560',
    mcu: 'ATmega2560',
    flashBytes: 253_952,
    ramBytes: 8_192,
    digitalPinCount: 70,
    serialPins: Object.freeze([0, 1]),
    i2cPins: Object.freeze([20, 21]) as readonly [number, number],
    nearProgmemBytes: 65_536,
    maxObjectBytes: 32_767,
  }),
]);

export function getArduinoBoard(id: string): ArduinoBoard | undefined {
  return ARDUINO_BOARDS.find((b) => b.id === id);
}

/** Microcontroladores PIC admitidos por el exportador XC8 (experimental). */
export interface PicDevice {
  readonly id: 'pic16f877a' | 'pic18f4550';
  readonly labelKey: string;
  readonly family: 16 | 18;
  readonly part: string;
  /** Memoria de programa en palabras de instrucción (PIC16) o bytes (PIC18). */
  readonly programMemory: number;
  readonly programMemoryUnit: 'words' | 'bytes';
  readonly ramBytes: number;
  /** Puertos disponibles y bits implementados en cada uno. */
  readonly ports: Readonly<Record<string, readonly number[]>>;
  readonly maxOscillatorHz: number;
  readonly minOscillatorHz: number;
}

export const PIC_DEVICES: readonly PicDevice[] = Object.freeze([
  Object.freeze({
    id: 'pic16f877a',
    labelKey: 'pic.pic16f877a',
    family: 16,
    part: 'PIC16F877A',
    programMemory: 8_192,
    programMemoryUnit: 'words',
    ramBytes: 368,
    ports: Object.freeze({
      A: [0, 1, 2, 3, 4, 5],
      B: [0, 1, 2, 3, 4, 5, 6, 7],
      C: [0, 1, 2, 3, 4, 5, 6, 7],
      D: [0, 1, 2, 3, 4, 5, 6, 7],
      E: [0, 1, 2],
    }),
    maxOscillatorHz: 20_000_000,
    minOscillatorHz: 32_768,
  }),
  Object.freeze({
    id: 'pic18f4550',
    labelKey: 'pic.pic18f4550',
    family: 18,
    part: 'PIC18F4550',
    programMemory: 32_768,
    programMemoryUnit: 'bytes',
    ramBytes: 2_048,
    ports: Object.freeze({
      A: [0, 1, 2, 3, 4, 5],
      B: [0, 1, 2, 3, 4, 5, 6, 7],
      C: [0, 1, 2, 6, 7],
      D: [0, 1, 2, 3, 4, 5, 6, 7],
      E: [0, 1, 2],
    }),
    maxOscillatorHz: 48_000_000,
    minOscillatorHz: 32_768,
  }),
]);

export function getPicDevice(id: string): PicDevice | undefined {
  return PIC_DEVICES.find((d) => d.id === id);
}
