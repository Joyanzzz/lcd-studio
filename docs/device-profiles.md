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

### CGRAM y ROM: límite de 8 patrones propios

- Celdas vacías → `0x20` (espacio), presente en todas las ROM del HD44780.
- Con ROM `none` (por omisión), cualquier otra celda usa una ranura CGRAM.
- Con ROM `hd44780-a00` (experimental), una celda que coincide **exactamente**
  con un glifo de la tabla se envía como ese código. La tabla está transcrita
  de la hoja de datos y no se ha verificado píxel a píxel contra un módulo.
- El límite es de **8 patrones distintos** por fotograma, no de 8 celdas: un
  patrón repetido en varias celdas ocupa una sola ranura, y el espacio y los
  glifos de la ROM elegida no ocupan ninguna.

Reglas (implementadas en `src/core/constraints.ts` y aplicadas en
`EditorStore.commit`, por donde pasan trazo, línea, forma, relleno, borrado,
texto, pegado, mover, transformar, importar imagen o GIF, cambiar la ROM y
colocar patrones):

- Se valida el **resultado completo** de cada operación. Si dejaría un
  fotograma con más de 8 patrones (o, en un proyecto en reparación, con más
  de los que ya tenía), no se aplica nada: ni dibujo parcial, ni paso de
  deshacer, ni marca de modificado, ni autoguardado. Nunca se elimina
  contenido para que quepa.
- Durante un gesto el lienzo muestra una vista previa temporal; al soltar,
  si no es válida, vuelve al estado confirmado.
- **Aviso único**: un solo aviso (no una pila de notificaciones), visible
  mientras dura el intento y 5 s después del último; un intento nuevo reutiliza
  el aviso y reinicia la espera; una edición válida lo quita; se cierra con su
  botón o con Escape; no toma el foco y se anuncia una vez por aparición
  (`src/ui/state/limit-notice.ts`).
- **Paleta de 8 ranuras** (panel Dibujo): cada ranura muestra su patrón y en
  cuántas celdas se usa. Elegir una activa «Colocar patrón» (tecla G) para
  repetirlo en otra celda; copiar y pegar también repite patrones.
- **Celdas atenuadas**: con 8 patrones en uso se atenúan (con borde
  discontinuo, no solo color) las celdas donde dibujar crearía un noveno
  patrón: las vacías o de ROM y, en modo copia, las que comparten patrón. Es
  orientativo: repetir un patrón existente en ellas sigue permitido.
- **Patrón compartido**: antes de dibujar se elige qué pasa al editar una
  aparición de un patrón repetido: «Crear una copia independiente» (solo
  cambia esa celda; si sale un patrón nuevo necesita ranura) o «Cambiar todas
  sus apariciones en el fotograma» (como editar la ranura CGRAM). El lienzo
  muestra el resultado mientras se dibuja. Se aplica a las herramientas de
  dibujo (lápiz, borrador, línea, formas, relleno, texto y el cursor de
  teclado); mover, pegar y transformar siempre trabajan sobre las celdas.
- **Proyectos en reparación**: un proyecto antiguo con fotogramas de más de
  8 patrones se abre completo con un aviso y una banda visible; las celdas
  sobrantes llevan un borde naranja discontinuo. Se permiten las ediciones
  que mantienen o reducen el número de patrones y se puede guardar. La
  exportación de código y de datos CGRAM queda bloqueada (con las celdas
  exactas); las imágenes se pueden exportar con un aviso de que no certifican
  compatibilidad.
- **Ajustar a 8 caracteres…** (Proyecto, panel Dibujo o banda de reparación)
  es una herramienta de *edición* explícita, nunca un paso de la exportación.
  Elige los 8 glifos propios que mejor representan el fotograma y sustituye
  cada celda sobrante por el destino más parecido: uno de esos 8, una letra de
  la ROM elegida (si la hay) o el espacio. El error se mide en píxeles
  distintos, ponderado por cuántas celdas repiten el glifo.
  - Alcance: fotograma actual o todos los fotogramas que no caben; los que ya
    caben no se tocan.
  - Muestra un resumen y una vista previa antes/después antes de aplicar.
  - Es **con pérdida** y se deshace con Ctrl+Z. Es determinista.

## Pantallas gráficas

| Id               | Tamaño        | Controlador | I²C          |
| ---------------- | ------------- | ----------- | ------------ |
| `ssd1306-128x64` | 128 × 64      | SSD1306     | 0x3C, 0x3D   |
| `ssd1306-128x32` | 128 × 32      | SSD1306     | 0x3C, 0x3D   |
| `pcd8544-84x48`  | 84 × 48       | PCD8544     | —            |
| `ks0108-128x64`  | 128 × 64      | KS0108      | —            |
| `graphic-custom` | 1–512 × 1–512 | —           | —            |

## Matriz de LEDs 8 × 8 (MAX7219)

| Id            | Tamaño | Controlador | Módulos |
| ------------- | ------ | ----------- | ------- |
| `max7219-8x8` | 8 × 8  | MAX7219     | 1       |

Es una matriz física de 64 LEDs monocromos (no un LCD de 8 × 8 caracteres).
Se dibuja con el editor raster común; el lienzo muestra LEDs redondos. Solo
se implementa un módulo; el campo `modules` del perfil deja preparado el
modelo para cadenas posteriores (no implementadas).

Configuración física del proyecto (`device.matrix`, separada del dibujo):

- **Giro del módulo montado**: 0°, 90°, 180° o 270° en sentido horario. El
  editor muestra la imagen tal como debe verse; el giro solo cambia los datos
  exportados. Voltear o desplazar el dibujo son ediciones normales del
  contenido, así que nunca se gira dos veces.
- **Cableado interno** (perfiles de correspondencia, ninguno se supone
  universal):

  | Id              | Registro DIGn (0x01 + n) | Primer LED del byte          |
  | --------------- | ------------------------ | ---------------------------- |
  | `rows-msb-left` | fila n                   | bit 7 = columna 0 (izquierda) — convención de `LedControl::setRow` en módulos 1088AS |
  | `rows-lsb-left` | fila n                   | bit 0 = columna 0            |
  | `cols-msb-top`  | columna n                | bit 7 = fila 0 (arriba)      |
  | `cols-lsb-top`  | columna n                | bit 0 = fila 0               |

  Filas, columnas y bits se refieren al módulo en su orientación de
  referencia (giro 0°). Implementación: `src/exporters/shared/max7219.ts`.
- **Brillo**: 0–15, registro de intensidad 0x0A (1/32 a 31/32 de ciclo).

Tiempos: la duración de cada fotograma (20–60 000 ms) solo decide cuándo se
cambia la imagen. El refresco físico de los LEDs lo hace el MAX7219 por sí
mismo (multiplexa los 8 dígitos a unos 800 Hz según su hoja de datos) y no
depende de la animación.

**Cómo verificar el módulo**: Proyecto → Patrones de diagnóstico añade 19
fotogramas (orientación con flecha, esquinas 1-2-3-4, barrido de filas,
barrido de columnas y todo encendido). Procedimiento completo en
`docs/hardware-validation.md`.

## Conexiones y generación de código por pantalla

El asistente de nuevo proyecto y Proyecto → Configuración solo ofrecen estas
combinaciones (`src/device-profiles/capabilities.ts`). Se puede dejar todo
sin configurar («Solo diseño») y decidirlo después.

| Pantalla           | Conexión                         | Destinos de código                                                          |
| ------------------ | -------------------------------- | --------------------------------------------------------------------------- |
| HD44780 (todas)    | Paralelo 4 bits                  | Arduino LiquidCrystal (boceto); PIC XC8 (experimental)                      |
| HD44780 (todas)    | Paralelo 8 bits                  | PIC XC8 (experimental)                                                      |
| HD44780 (todas)    | I²C con PCF8574                  | Arduino LiquidCrystal_I2C (boceto)                                          |
| SSD1306            | I²C                              | Adafruit GFX/SSD1306 (boceto), U8g2 (boceto), páginas verticales (datos)    |
| SSD1306            | SPI                              | Adafruit GFX (tablas), U8g2 (tablas), páginas verticales (datos)            |
| PCD8544            | SPI                              | Adafruit GFX (tablas), U8g2 (tablas), páginas verticales (datos)            |
| KS0108             | Paralelo (dos controladores)     | Adafruit GFX (tablas), U8g2 (tablas), páginas verticales (datos)            |
| Gráfica genérica   | —                                | Solo imágenes y datos de mapa de bits                                       |
| MAX7219 8 × 8      | Serie de 3 hilos (DIN, CLK, CS)  | Arduino sin bibliotecas (boceto); registros (datos)                         |

El bus de 4 u 8 bits es una opción de conexión del HD44780 en paralelo (no
una profundidad de color ni una opción de otras pantallas); con la conexión
configurada, el exportador XC8 usa ese bus.

## Conversión de pantalla

Proyecto → Convertir pantalla (`src/core/convert.ts`). Todas las familias
actuales son mapas de píxeles, así que la regla es geométrica: recortar o
ampliar anclado arriba a la izquierda o centrado, o escalar por vecino más
próximo. Antes de confirmar se ve el antes/después del fotograma actual y un
informe (píxeles encendidos recortados, cambio de familia y colores, ROM que
deja de aplicar, conexión o destino que quedan sin configurar, fotogramas que
superarían 8 caracteres propios). Hacia LCD de caracteres nada se ajusta
solo: los fotogramas que no caben dejan el proyecto en reparación. La
conversión es una única edición deshacible, puede guardar antes una copia del
original y no sobrescribe ningún archivo.

## Siete segmentos (fase posterior, no implementado)

Los perfiles declaran `content: 'raster'`. Los displays de siete segmentos
tendrán su propio modelo de contenido (segmentos a–g y punto decimal, número
de dígitos y elementos del módulo, entrada limitada a representaciones
posibles) y no se tratarán como una matriz raster. Empezarán por módulos
MAX7219 (que tienen decodificación BCD y modo sin decodificar); el
multiplexado directo por GPIO queda para otra fase por sus requisitos de
temporización y polaridad. La frecuencia de refresco físico de un display
siempre es distinta de la duración de los fotogramas.

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
