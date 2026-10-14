# Perfiles de pantalla

Definidos en `src/device-profiles/`. Cada perfil tiene un **identificador
estable** que se guarda en los proyectos y nunca se renombra.

## LCD de caracteres (HD44780)

| Id             | Columnas × filas | Lienzo   | DDRAM por fila             | CGRAM | ROM                          |
| -------------- | ---------------- | -------- | -------------------------- | ----- | ---------------------------- |
| `hd44780-16x2` | 16 × 2           | 80 × 16  | `0x00, 0x40`               | 8     | ninguna; A00 (experimental)  |
| `hd44780-20x2` | 20 × 2           | 100 × 16 | `0x00, 0x40`               | 8     | ninguna; A00 (experimental)  |
| `hd44780-16x4` | 16 × 4           | 80 × 32  | `0x00, 0x40, 0x10, 0x50`   | 8     | ninguna; A00 (experimental)  |
| `hd44780-20x4` | 20 × 4           | 100 × 32 | `0x00, 0x40, 0x14, 0x54`   | 8     | ninguna; A00 (experimental)  |

Todos: carácter de 5 × 8 píxeles, controlador único en modo de 2 líneas.

### De dónde salen las direcciones DDRAM

Hoja de datos Hitachi HD44780U (ADE-207-272), «Relationship Between DDRAM
Address and Display Position»: en modo de 2 líneas la línea 1 ocupa
`0x00–0x27` y la línea 2 `0x40–0x67`. Los módulos de 4 filas con un solo
controlador continúan cada línea en la fila 3 y 4: la fila 3 empieza en
`0x00 + columnas` y la fila 4 en `0x40 + columnas`.

La prueba `tests/unit/device-profiles/profiles.test.ts` comprueba, para cada
perfil, que todas las celdas caen dentro de los rangos válidos y que ninguna
dirección se repite.

**Bibliotecas:** `LiquidCrystal_I2C` 1.1.2 usa en `setCursor()` la tabla fija
`{0x00, 0x40, 0x14, 0x54}`, incorrecta para 16 × 4. Por eso el código
generado no usa `setCursor()`: escribe la dirección del perfil con
`lcd.command(0x80 | dirección)`.

### Perfiles eliminados

16 × 1, 8 × 2, 24 × 2, 40 × 2 y las LCD de caracteres «personalizadas» del
prototipo se eliminaron: sus mapas DDRAM varían entre fabricantes (por ejemplo,
algunos 16 × 1 se direccionan como 8 × 2) y 40 × 4 necesita dos controladores.
Un perfil personalizado futuro deberá requerir un modo avanzado, offsets DDRAM
explícitos y validación completa.

### CGRAM y ROM

- Celdas vacías → `0x20` (espacio), presente en todas las ROM del HD44780.
- Con ROM `none` (por omisión), cualquier otra celda usa una ranura CGRAM.
- Con ROM `hd44780-a00` (experimental), una celda que coincide **exactamente**
  con un glifo de la tabla se envía como ese código. La tabla está transcrita
  de la hoja de datos y no se ha verificado píxel a píxel contra un módulo.
- Las celdas iguales comparten ranura. Si un fotograma necesita más de 8
  glifos propios, la exportación se bloquea y se listan las celdas exactas.

## Pantallas gráficas

| Id               | Tamaño        | Controlador | I²C          |
| ---------------- | ------------- | ----------- | ------------ |
| `ssd1306-128x64` | 128 × 64      | SSD1306     | 0x3C, 0x3D   |
| `ssd1306-128x32` | 128 × 32      | SSD1306     | 0x3C, 0x3D   |
| `pcd8544-84x48`  | 84 × 48       | PCD8544     | —            |
| `ks0108-128x64`  | 128 × 64      | KS0108      | —            |
| `graphic-custom` | 1–512 × 1–512 | —           | —            |

## Placas para los bocetos Arduino

Límites de `boards.txt` de `arduino:avr` 1.8.8 (descuentan el gestor de arranque):

| Placa             | MCU        | Flash    | RAM     | Pines digitales | I²C (SDA, SCL) |
| ----------------- | ---------- | -------- | ------- | --------------- | -------------- |
| Arduino Uno       | ATmega328P | 32 256 B | 2 048 B | 0–19            | 18, 19         |
| Arduino Nano      | ATmega328P | 30 720 B | 2 048 B | 0–19            | 18, 19         |
| Arduino Mega 2560 | ATmega2560 | 253 952 B| 8 192 B | 0–69            | 20, 21         |

Restricciones aplicadas: objetos ≤ 32 767 bytes (límite de avr-gcc), datos en
PROGMEM dentro de los primeros 64 KiB (`pgm_read_*` usa punteros de 16 bits).

## PIC (exportador experimental)

PIC16F877A (8 K palabras, 368 B RAM) y PIC18F4550 (32 KiB, 2 KiB RAM), con
oscilador de 32 768 Hz a 20 MHz (cristal sin PLL).
