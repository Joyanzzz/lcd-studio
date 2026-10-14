/** Juegos de caracteres ROM que el usuario puede seleccionar. */
export type RomCharsetId = 'none' | 'hd44780-a00';

export interface RomCharset {
  readonly id: RomCharsetId;
  /** Clave de traducción del nombre. */
  readonly labelKey: string;
  /** `experimental`: la tabla no se ha verificado contra hardware. */
  readonly stability: 'stable' | 'experimental';
}

export interface CharacterProfile {
  readonly kind: 'character';
  /** Identificador estable: nunca se renombra porque se guarda en los proyectos. */
  readonly id: string;
  readonly labelKey: string;
  /** Controlador de la pantalla. */
  readonly controller: 'HD44780';
  readonly columns: number;
  readonly rows: number;
  /** Anchura del carácter en píxeles. */
  readonly cellWidth: 5;
  /** Altura del carácter en píxeles (fuente 5×8). */
  readonly cellHeight: 8;
  /** Ranuras de caracteres definidos por el usuario (CGRAM). */
  readonly cgramSlots: 8;
  /** Dirección DDRAM de la primera columna de cada fila (modo de 2 líneas). */
  readonly ddramRowAddresses: readonly number[];
  /** Juegos ROM seleccionables. `none` siempre está disponible. */
  readonly romCharsets: readonly RomCharsetId[];
  /** Ancho del lienzo en píxeles = columnas × 5. */
  readonly width: number;
  /** Alto del lienzo en píxeles = filas × 8. */
  readonly height: number;
  /** Fuente de la que se tomó el mapa DDRAM. */
  readonly ddramSource: string;
}

export interface GraphicProfile {
  readonly kind: 'graphic';
  readonly id: string;
  readonly labelKey: string;
  /** Controlador, o `null` para una pantalla gráfica genérica. */
  readonly controller: 'SSD1306' | 'PCD8544' | 'KS0108' | null;
  /** Dimensiones fijas, o `null` si el usuario elige el tamaño. */
  readonly fixedSize: { readonly width: number; readonly height: number } | null;
  /** Direcciones I²C admitidas por el controlador (si aplica). */
  readonly i2cAddresses: readonly number[];
}

export type DisplayProfile = CharacterProfile | GraphicProfile;
