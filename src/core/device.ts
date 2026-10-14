import {
  isConnectionFor,
  MATRIX_ROTATIONS,
  MATRIX_WIRINGS,
  MAX7219_BRIGHTNESS_MAX,
  targetsFor,
  type ConnectionId,
  type DisplayProfile,
  type MatrixRotation,
  type MatrixWiringId,
} from '../device-profiles/index.ts';

/**
 * Configuración del dispositivo guardada en el proyecto: cómo se conecta la
 * pantalla y con qué herramienta se generará el código. Ambas pueden quedar
 * sin definir (`null`) para trabajar solo en el diseño y configurarlas
 * después. Para matrices de LEDs incluye la orientación física del módulo, su
 * cableado interno y el brillo, que se aplican al exportar (el dibujo nunca
 * se gira por ellos).
 */

export interface MatrixConfig {
  readonly rotation: MatrixRotation;
  readonly wiring: MatrixWiringId;
  /** 0–15 (registro de intensidad del MAX7219). */
  readonly brightness: number;
}

export interface DeviceConfig {
  readonly connection: ConnectionId | null;
  /** Exportador de código elegido, o `null` (solo diseño). */
  readonly codeTarget: string | null;
  /** Solo en matrices de LEDs. */
  readonly matrix: MatrixConfig | null;
}

export const DEFAULT_MATRIX: MatrixConfig = Object.freeze({
  rotation: 0,
  wiring: 'rows-msb-left',
  brightness: 4,
});

/** Configuración inicial: sin conexión ni destino (configurable después). */
export function defaultDevice(profile: DisplayProfile): DeviceConfig {
  return Object.freeze({
    connection: null,
    codeTarget: null,
    matrix: profile.kind === 'led-matrix' ? DEFAULT_MATRIX : null,
  });
}

export function isValidMatrix(value: unknown): value is MatrixConfig {
  if (typeof value !== 'object' || value === null) return false;
  const m = value as Record<string, unknown>;
  return (
    (MATRIX_ROTATIONS as readonly unknown[]).includes(m['rotation']) &&
    (MATRIX_WIRINGS as readonly unknown[]).includes(m['wiring']) &&
    typeof m['brightness'] === 'number' &&
    Number.isInteger(m['brightness']) &&
    m['brightness'] >= 0 &&
    m['brightness'] <= MAX7219_BRIGHTNESS_MAX
  );
}

/** Errores de la configuración para el perfil (vacío si es válida). */
export function deviceErrors(profile: DisplayProfile, device: DeviceConfig): string[] {
  const errors: string[] = [];
  if (device.connection !== null && !isConnectionFor(profile, device.connection)) {
    errors.push('device.invalidConnection');
  }
  if (
    device.codeTarget !== null &&
    !targetsFor(profile, device.connection).some((t) => t.exporterId === device.codeTarget)
  ) {
    errors.push('device.invalidTarget');
  }
  if (profile.kind === 'led-matrix') {
    if (!isValidMatrix(device.matrix)) errors.push('device.invalidMatrix');
  } else if (device.matrix !== null) {
    errors.push('device.invalidMatrix');
  }
  return errors;
}

/**
 * Adapta una configuración a otro perfil (conversión de pantalla): conserva
 * lo que siga siendo válido y descarta lo demás, sin inventar equivalencias.
 */
export function adaptDevice(profile: DisplayProfile, device: DeviceConfig): DeviceConfig {
  const connection =
    device.connection !== null && isConnectionFor(profile, device.connection)
      ? device.connection
      : null;
  const codeTarget =
    device.codeTarget !== null &&
    targetsFor(profile, connection).some((t) => t.exporterId === device.codeTarget)
      ? device.codeTarget
      : null;
  const matrix =
    profile.kind === 'led-matrix'
      ? isValidMatrix(device.matrix)
        ? device.matrix
        : DEFAULT_MATRIX
      : null;
  return Object.freeze({ connection, codeTarget, matrix });
}
