# Validación en hardware

Este documento separa tres niveles de evidencia. **Ninguno implica el
siguiente**: que un boceto compile no significa que la pantalla muestre la
animación correcta.

| Nivel | Qué demuestra | Cómo se obtiene |
| ----- | ------------- | --------------- |
| Compilación | El código generado es C/C++ válido para esa placa y biblioteca, y cabe en flash y RAM. | `npm run arduino:check` (CI, job `arduino`) con `arduino-cli`. |
| Simulación | El programa se ejecuta y envía a la pantalla los comandos esperados. | Ninguna por ahora (ver «Pendiente»). |
| Prueba física | La animación se ve correctamente en una pantalla real conectada a la placa. | Montaje manual; se registra abajo con fecha, montaje y resultado. |

Entorno de compilación: `arduino-cli` 1.5.1, núcleo `arduino:avr` 1.8.8.

## Matriz

Leyenda: ✅ hecho y correcto · ❌ hecho con fallos · — no realizado.

| Controlador | Placa | Biblioteca | Versión | Compilación | Simulación | Prueba física |
| ----------- | ----- | ---------- | ------- | ----------- | ---------- | ------------- |
| HD44780 16×2 (4 bits) | Arduino Uno | LiquidCrystal | 1.0.7 | ✅ (loop, once, pingpong; PROGMEM y RAM; 1 fotograma) | — | — |
| HD44780 16×4 (4 bits) | Arduino Uno | LiquidCrystal | 1.0.7 | ✅ (loop, once, pingpong; PROGMEM y RAM) | — | — |
| HD44780 20×4 (4 bits) | Arduino Uno | LiquidCrystal | 1.0.7 | ✅ (loop, once, pingpong; PROGMEM y RAM) | — | — |
| HD44780 16×2 (4 bits, índice `uint16_t`) | Arduino Mega 2560 | LiquidCrystal | 1.0.7 | ✅ | — | — |
| HD44780 20×2 | — | LiquidCrystal | 1.0.7 | — (mismo código que 20×4 con 2 filas; sin caso propio) | — | — |
| HD44780 16×2 + PCF8574 | Arduino Uno | LiquidCrystal I2C | 1.1.2 | ✅ (once) | — | — |
| HD44780 20×4 + PCF8574 | Arduino Uno | LiquidCrystal I2C | 1.1.2 | ✅ (pingpong, RAM) | — | — |
| HD44780 16×4 + PCF8574 | Arduino Nano | LiquidCrystal I2C | 1.1.2 | ✅ (loop) | — | — |
| SSD1306 128×64 I²C | Arduino Uno | Adafruit SSD1306 + GFX | 2.5.17 / 1.12.6 | ✅ (loop) | — | — |
| SSD1306 128×32 I²C | Arduino Mega 2560 | Adafruit SSD1306 + GFX | 2.5.17 / 1.12.6 | ✅ (once) | — | — |
| SSD1306 128×64 | Arduino Uno | U8g2 (modo página) | 2.36.19 | ✅ (pingpong) | — | — |
| SSD1306 128×32 | Arduino Uno | U8g2 (modo página) | 2.36.19 | ✅ (loop, RAM) | — | — |
| Pantalla gráfica (solo datos) | Arduino Uno | — (cabecera Adafruit_GFX, XBM, páginas, caracteres) | — | ✅ | — | — |
| PCD8544 84×48 | — | — | — | — (solo datos; sin boceto) | — | — |
| KS0108 128×64 | — | — | — | — (solo datos; sin boceto) | — | — |
| HD44780 (cualquier tamaño) | PIC16F877A / PIC18F4550 | XC8 (experimental) | — | — (XC8 no está instalado en CI) | — | — |

## Memoria estimada frente a la real

La estimación que muestra la aplicación debe ser **igual o mayor** que lo
que informa el compilador. `scripts/arduino-check.ts` falla si no es así.
Resultados del 2026-10-13 (bytes, real / estimado):

| Caso | Placa | Flash | RAM |
| ---- | ----- | ----- | --- |
| LiquidCrystal 16×2 loop PROGMEM | Uno | 2 848 / 3 202 | 59 / 137 |
| LiquidCrystal 16×2 loop RAM | Uno | 2 818 / 3 202 | 551 / 629 |
| LiquidCrystal 20×4 pingpong PROGMEM | Uno | 3 160 / 3 490 | 65 / 137 |
| LiquidCrystal 20×4 loop RAM | Uno | 3 096 / 3 490 | 843 / 917 |
| LiquidCrystal 16×2, un fotograma | Uno | 1 994 / 2 792 | 53 / 137 |
| LiquidCrystal 16×2, índice ancho | Mega 2560 | 7 586 / 7 904 | 67 / 137 |
| LiquidCrystal I2C 16×2 once | Uno | 4 054 / 4 522 | 263 / 341 |
| LiquidCrystal I2C 20×4 pingpong RAM | Uno | 4 214 / 4 714 | 789 / 861 |
| LiquidCrystal I2C 16×4 loop | Nano | 4 604 / 5 106 | 267 / 341 |
| Adafruit SSD1306 128×64 loop | Uno | 19 574 / 20 320 | 350 / 1 440 ¹ |
| Adafruit SSD1306 128×32 once | Mega 2560 | 29 628 / 30 376 | 350 / 928 ¹ |
| U8g2 128×64 pingpong | Uno | 12 836 / 13 460 | 666 / 724 |
| U8g2 128×32 loop RAM | Uno | 8 892 / 9 864 | 1 172 / 1 240 |

¹ Adafruit SSD1306 reserva el búfer de pantalla con `malloc` al arrancar; el
compilador no lo cuenta, la estimación sí.

La tabla completa (31 casos) se genera en `build/arduino-report.json`.

## Afirmaciones que requieren verificación física

Hasta que se registre una prueba física, estas afirmaciones se basan solo en
la hoja de datos y en la compilación:

1. Las direcciones DDRAM de 16×4 (`0x00, 0x40, 0x10, 0x50`) y 20×4
   (`0x00, 0x40, 0x14, 0x54`) colocan cada fila en su lugar.
2. Recargar ranuras CGRAM entre fotogramas no produce parpadeos visibles a
   20 ms por fotograma con LiquidCrystal ni con LiquidCrystal I2C a 100 kHz.
3. El orden de pines de LiquidCrystal I2C 1.1.2 coincide con los módulos
   PCF8574 comunes (las direcciones 0x27 y 0x3F son las más habituales, pero
   dependen del fabricante).
4. El modo «una vez» deja la última imagen visible y la placa en reposo
   (`SLEEP_MODE_PWR_DOWN`) sin reiniciarse.
5. Los mapas de bits de Adafruit_GFX (MSB primero) y XBM de U8g2 (LSB
   primero) se ven sin espejado.
6. El empaquetado en páginas verticales coincide con SSD1306, PCD8544 y KS0108
   al escribirlo directamente en su memoria.
7. La tabla ROM A00 (experimental) coincide con el chip real; los
   controladores con ROM A02 u otras variantes muestran otros glifos.
8. El código PIC XC8 compila y funciona (experimental: no se ha compilado).

## Cómo registrar una prueba física

Añade una fila a la matriz cambiando «—» por ✅ o ❌ y una entrada aquí con:
fecha, placa y revisión, módulo de pantalla (fabricante, controlador,
adaptador I²C), biblioteca y versión, proyecto usado, perfil y modo de
reproducción, y una foto o vídeo del resultado. Un ❌ debe enlazar a una
incidencia.

Registro: sin pruebas físicas por ahora.
