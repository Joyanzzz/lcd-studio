# Formatos de exportación

Cada exportador es un módulo independiente en `src/exporters/` que declara:
pantallas compatibles, orientación, orden de bits, restricciones, estimación
de memoria, extensión y pruebas de referencia. Todos son funciones puras
`(proyecto, opciones) → archivos`; la versión web y la de escritorio ejecutan
exactamente el mismo código (en un Web Worker), así que el mismo proyecto
produce siempre los mismos bytes.

Antes de generar se valida todo; si hay un error, **no se genera nada** y la
interfaz explica el motivo. Los avisos (por ejemplo, flash casi llena) no
bloquean.

## Asistente (Exportar → Exportar…, Ctrl+E)

1. **Contenido**: fotograma actual, selección (rectángulo del fotograma
   actual) o animación completa. Lo que no aplica aparece deshabilitado con
   la razón (sin selección, un solo fotograma).
2. **Tipo y formato**, en tres grupos:
   - *Imágenes*: PNG, hoja de sprites y GIF animado (no hay BMP).
   - *Datos de mapa de bits*: los píxeles como bytes (arreglo C, archivo
     binario o texto) con el orden de bits indicado. «Mapa de bits» aquí NO es
     un archivo .BMP.
   - *Código*: solo los destinos compatibles con la pantalla y la conexión
     del proyecto (ver `docs/device-profiles.md`); el destino del proyecto se
     marca y se preselecciona.
   Los formatos incompatibles con el contenido se muestran deshabilitados con
   la razón junto a la opción (p. ej. GIF necesita la animación completa; el
   código no admite una selección).
3. **Opciones** del formato (placa, pines, identificador…). El alcance de
   fotogramas lo fija el paso 1.
4. **Validación y resultado**: diagnósticos, memoria estimada y vista previa.
   Solo al pulsar **Guardar** se escribe el archivo; si hay varios, se
   pueden empaquetar en un ZIP (contenedor, no un formato de contenido).
   Las opciones de una exportación guardada se recuerdan para repetirla;
   cancelar no cambia nada.

Guardar el proyecto editable (Archivo → Guardar) y exportar un resultado
(Exportar) son acciones distintas: el proyecto conserva todo para seguir
editando; la exportación produce archivos para usar en otro sitio.

## Resumen

| Id | Nombre | Pantallas | Orientación / bits | Salida | Estado |
| -- | ------ | --------- | ------------------ | ------ | ------ |
| `adafruit-gfx` | Adafruit_GFX `drawBitmap` | gráficas | filas, MSB primero | `.h` o `.ino` (SSD1306) | estable |
| `u8g2-xbm` | U8g2 / XBM | gráficas | filas, LSB primero | `.h` o `.ino` (SSD1306) | estable |
| `vertical-pages` | Páginas verticales | gráficas | columnas de 8 px, bit 0 arriba | `.h` | estable |
| `arduino-liquidcrystal` | Arduino LiquidCrystal | HD44780 | celdas + CGRAM | `.ino` | estable |
| `arduino-liquidcrystal-i2c` | Arduino LiquidCrystal_I2C | HD44780 | celdas + CGRAM | `.ino` | estable |
| `pic-xc8` | PIC XC8 | HD44780 | celdas + CGRAM | `.zip` (5 archivos) | **experimental** |
| `arduino-max7219` | Arduino MAX7219 | matriz LED 8×8 | 8 registros DIG0–DIG7 por fotograma | `.ino` | estable |
| `max7219-registers` | Registros MAX7219 | matriz LED 8×8 | 8 bytes por fotograma (DIG0–DIG7) | `.bin` o `.h` | estable |
| `custom-chars` | Caracteres 5×8 | HD44780 | filas de 5 bits, bit 4 izquierda | `.h` | estable |
| `binary` | Datos binarios | todas | filas MSB / filas LSB / páginas | `.bin` | estable |
| `ascii` | ASCII art | todas | texto | `.txt` | estable |
| `png` | PNG | todas | imagen indexada | `.png` | estable |
| `sprite-sheet` | Hoja de sprites | todas | imagen indexada | `.png` (+ `.json`) | estable |
| `gif` | GIF animado | todas | GIF89a | `.gif` | estable |

## Empaquetado de bits

- **Filas MSB** (`packRowsMsb`): cada fila empieza en un byte nuevo; el bit 7
  del primer byte es el píxel izquierdo. Bytes por fila `ceil(ancho/8)`; los
  bits sobrantes valen 0.
- **Filas LSB** (`packRowsLsb`, XBM): igual, pero el bit 0 es el píxel izquierdo.
- **Páginas verticales** (`packPages`): cada byte son 8 píxeles de una
  columna, bit 0 arriba; página 0 (filas 0–7) de izquierda a derecha, después
  la página 1… La última página se rellena con 0 si la altura no es múltiplo de 8.

Patrones dorados probados (`tests/unit/exporters/packing-encoders.test.ts`):
píxel aislado, tablero, diagonales, bordes, bitmap vacío y lleno, con tamaños
1×1, 7×3, 8×8, 9×9, 13×11, 16×2, 128×64 y 84×48.

## Bocetos Arduino (AVR)

Comunes a `adafruit-gfx`, `u8g2-xbm`, `arduino-liquidcrystal` y
`arduino-liquidcrystal-i2c`:

- Solo AVR (Uno, Nano, Mega 2560). Un `#error` lo indica si se compila para
  otra arquitectura, en lugar de compilar y funcionar mal.
- Índices y contadores de fotogramas son `uint16_t`; los índices de glifo son
  `uint16_t` si hay más de 255 glifos distintos.
- Con PROGMEM se leen las tablas con `pgm_read_byte/word/ptr` y `memcpy_P`.
  **Sin PROGMEM no aparece ninguna llamada `pgm_read_*` ni `memcpy_P`.**
- Adafruit_GFX fuerza PROGMEM y lo explica: `drawBitmap(x, y, const uint8_t[], …)`
  siempre lee la flash.
- La reproducción sigue el modo del proyecto (bucle, ida y vuelta, una vez).
  En «una vez» y con un único fotograma, tras mostrar el último el MCU entra en
  `SLEEP_MODE_PWR_DOWN` con interrupciones desactivadas: la pantalla conserva su
  contenido y no hay ciclo ocupado.
- Validación: pines duplicados, fuera de rango y del puerto serie (aviso),
  dirección I²C (PCF8574 `0x20–0x27`, PCF8574A `0x38–0x3F`; SSD1306 `0x3C/0x3D`),
  tamaño máximo de objeto (32 767 B), alcance de `pgm_read_*` (64 KiB), flash y
  RAM de la placa.
- Estimación de memoria: huella medida de cada biblioteca + 1 024 B de código
  de reproducción + tablas. `scripts/arduino-check.ts` compila 31 bocetos y
  comprueba que la estimación nunca queda por debajo del valor real.

### Adafruit_GFX

Un arreglo por fotograma (`<nombre>_frame_N`), tabla de punteros
(`<nombre>_frames`) y duraciones (`<nombre>_durations_ms`), todo en PROGMEM.
En perfiles SSD1306 se ofrece un boceto completo con Adafruit_SSD1306 por I²C;
si `display.begin()` falla (sin memoria para el búfer), el MCU se detiene.

### U8g2

Igual estructura con orden XBM. Con PROGMEM: `U8X8_PROGMEM` + `drawXBMP()`.
Sin PROGMEM: tablas en RAM + `drawXBM()`. Boceto completo con el constructor de
página (`_1_`, 128 bytes de búfer) para SSD1306 128×64 y 128×32.

### LiquidCrystal y LiquidCrystal_I2C

Tablas: banco global de glifos (`GLYPHS`), ranura CGRAM de cada fotograma
(`FRAME_SLOTS`, `NO_GLYPH` = sin cambio), código de cada celda (`FRAME_CELLS`)
y duraciones. Al mostrar un fotograma solo se recargan las ranuras que cambian
y se escriben todas las celdas con `lcd.command(0x80 | ROW_ADDRESS[fila])`.
Las ranuras se asignan de forma estable entre fotogramas para minimizar
recargas. Nota: si una ranura visible cambia de glifo, las celdas que la
usaban muestran el nuevo glifo durante el instante (≈ milisegundos) que tarda
en reescribirse la pantalla.

## PIC XC8 (experimental)

Genera `main.c`, `lcd.h`, `lcd.c`, `anim.h` y `anim.c` para PIC16F877A
(`PORTxbits`) o PIC18F4550 (`LATxbits`), bus de 4 u 8 bits. Usa el mapa DDRAM
del perfil y, en «una vez», `SLEEP()` sin ciclo ocupado. Valida formato de pin,
existencia del bit en el dispositivo, RA4 de drenador abierto, pines
duplicados, puerto completo para 8 bits, conflicto RS/E con el puerto de datos,
frecuencia y memoria de programa (estimada).

**No se ha compilado con XC8 ni probado en hardware**: por eso solo aparece al
activar «Mostrar funciones experimentales» y la interfaz lo indica
claramente. Ver `docs/hardware-validation.md`.

## Matriz de LEDs MAX7219

Cada fotograma son **8 bytes**: los valores de los registros de dígito DIG0…
DIG7 (direcciones 0x01…0x08), en ese orden, ya con el giro físico del módulo
y el cableado del proyecto (tabla en `docs/device-profiles.md`). El dibujo del
proyecto no se gira: el giro describe cómo está montado el módulo.

- `max7219-registers` `.bin`: fotogramas uno tras otro, sin cabecera
  (`8 × fotogramas` bytes). `.h`: `uint8_t <id>_digits[]` y
  `uint16_t <id>_durations_ms[]`.
- `arduino-max7219` `.ino`: boceto completo sin bibliotecas externas. Escribe
  cada registro con `shiftOut()` (dirección y valor, MSB primero, CS a nivel
  bajo durante la escritura). Al iniciar: prueba de pantalla 0x0F = 0,
  decodificación 0x09 = 0 (matriz), límite de escaneo 0x0B = 7, intensidad
  0x0A = brillo, apagado 0x0C = 1 (normal). Pines por omisión DIN 11, CLK 13,
  CS 10 (cualquier pin digital). La reproducción usa las duraciones de los
  fotogramas; el refresco físico de los LEDs lo hace el propio MAX7219.

## Caracteres personalizados

Glifos `uint8_t nombre_char_N[8]` con literales `0b…` y, en un comentario, la
ranura de cada glifo y el mapa de celdas de cada fotograma. Por omisión solo
el fotograma actual. Se bloquea si algún fotograma supera 8 glifos.

## Datos binarios y ASCII

`.bin`: fotogramas uno tras otro sin cabecera; cada fotograma ocupa
`ceil(ancho/8)·alto` (filas) o `ceil(alto/8)·ancho` (páginas) bytes.
ASCII: `#` encendido, `.` apagado; con varios fotogramas, una línea
`; fotograma N (D ms)` antes de cada uno.

## Imágenes

Codificadores propios y deterministas (no se usa `canvas.toBlob`, que
comprime distinto en cada navegador):

- **PNG** indexado de 1 o 2 bits por píxel; compresión zlib con `fflate`
  (versión fijada).
- **Hoja de sprites**: cuadrícula, horizontal o vertical, con metadatos JSON
  opcionales (posición y duración de cada fotograma).
- **GIF89a** con LZW propio. Bucle e ida y vuelta se repiten indefinidamente
  (ida y vuelta expande los cuadros); «una vez» no incluye la extensión
  NETSCAPE. Las duraciones se redondean a centésimas y se avisa.

Colores: los de la pantalla (apagado, encendido y cristal para la separación
entre caracteres) o blanco y negro. Escala 1–16. Límites: 16 384 px por lado,
16,7 MP por imagen y 268 MP en total para un GIF.

## ZIP

Los exportadores con varios archivos se descargan en un ZIP plano (sin
carpetas), sin compresión, con fecha fija (1980-01-01) para que sea
determinista. Los nombres se validan contra rutas, `..`, unidades, caracteres
reservados y nombres de dispositivo de Windows, de modo que ninguna entrada
puede escapar del directorio de extracción («ZIP Slip»). La aplicación nunca
extrae archivos ZIP.
