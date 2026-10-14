# Auditoría funcional del prototipo

Este documento registra la Fase 1 de la reconstrucción: qué hacía el prototipo
monolítico (un único `index.html` de ~1 500 líneas con HTML, CSS y JavaScript
mezclados) y qué se decidió hacer con cada función.

El prototipo se usó **solo como referencia funcional y visual**. No forma parte
del repositorio, del producto ni de la distribución. Ningún archivo se copió;
los algoritmos que se reutilizaron (Bresenham, elipse de Zingl, relleno por
tramos, kernels de tramado, LZW de GIF, CRC-32) se reescribieron en TypeScript
estricto, aislados en módulos puros y cubiertos por pruebas.

## 1. Inventario del prototipo

### 1.1 Estructura general

| Área                 | Implementación en el prototipo                                                                                     |
| -------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Arquitectura         | Un archivo; estado global mutable `S`; ~120 funciones globales; manipulación directa del DOM con `innerHTML`.       |
| Estilos              | CSS en `<style>`, más estilos inline (`style="…"`) en HTML y JS.                                                     |
| Iconos               | Pixel-art 16×16 dibujado en `<canvas>` y convertido a `data:` URL en tiempo de ejecución.                          |
| Persistencia         | `localStorage` (`lcdstudio.v1`) con `try/catch` que **silencia** errores (cuota llena = pérdida silenciosa).       |
| Archivos de proyecto | JSON `{v:1, preset, disp, theme, custom, frames:[{d,b}]}` sin validación (solo comprueba que existan campos).      |
| Errores              | `alert()` y `console.warn`.                                                                                        |
| Procesamiento        | Todo en el hilo principal (decodificación, niveles, tramado, GIF, LZW).                                            |

### 1.2 Funciones detectadas

| #  | Función                                   | Comportamiento observado                                                                                               |
| -- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1  | Presets de pantalla                       | 9 LCD de caracteres (16×2, 20×4, 16×4, 20×2, 16×1, 8×2, 24×2, 40×2, LM016L) + 7 gráficas + 2 personalizadas.           |
| 2  | LCD de caracteres personalizada           | 1–64 columnas × 1–16 filas, sin mapa DDRAM.                                                                            |
| 3  | Gráfica personalizada                     | 1–512 × 1–512 sin comprobación de memoria.                                                                             |
| 4  | Temas LCD                                 | 10 paletas (LM016L, rojo, amarillo, azul, verde, blanco, OLED blanco/azul, ámbar) + "Personalizado" con 4 colores.     |
| 5  | Tema de interfaz                          | Windows 2000 claro/oscuro, recordado en `localStorage`.                                                                |
| 6  | Lápiz / goma                              | Clic izquierdo enciende, derecho apaga; trazos con Bresenham entre eventos.                                            |
| 7  | Línea, rectángulo, elipse                 | Vista previa durante el arrastre; opción "Formas rellenas".                                                           |
| 8  | Relleno por área                          | Relleno por tramos (scanline) con pila.                                                                                |
| 9  | Texto                                     | Fuente 5×7 ASCII; escala ×1–×3; avance auto/5/6; en LCD de caracteres se alinea a la celda.                           |
| 10 | Selección                                 | Rectángulo; arrastrar mueve, Ctrl+arrastrar copia; Ctrl+C/X/V; Supr borra; flechas mueven.                             |
| 11 | Deshacer / rehacer                        | Instantáneas completas de todos los fotogramas, máximo 120, sin límite de memoria.                                     |
| 12 | Simetría                                  | Horizontal, vertical y ambas.                                                                                          |
| 13 | Transformaciones                          | Invertir, limpiar, voltear H/V, desplazar (con/sin envolver), en fotograma actual o en todos.                          |
| 14 | Fotogramas                                | Nuevo, duplicar, borrar, mover izquierda/derecha; duración 10–60 000 ms; "A todos".                                    |
| 15 | Reproducción                              | Bucle, ida y vuelta, una vez; `setTimeout` encadenado.                                                                 |
| 16 | Papel cebolla                             | Anterior/siguiente 0–5, opacidad, modo circular.                                                                       |
| 17 | Zoom                                      | Deslizador 2–28 y "Ajustar a ventana" con `ResizeObserver`.                                                            |
| 18 | Rejilla                                   | Separación entre píxeles; en LCD de caracteres separa también las celdas.                                              |
| 19 | Análisis CGRAM                            | Cuenta dibujos distintos por fotograma; marca en rojo las celdas que no caben.                                         |
| 20 | Coincidencia ROM                          | Compara celdas con una fuente 5×7 genérica y las trata como ASCII de la ROM A00 (sin verificar que la fuente sea la ROM). |
| 21 | Importar imágenes                         | Arrastrar, pegar, selector; varias a la vez; `createImageBitmap`; reducción a 2 400 px.                                |
| 22 | GIF animado                               | Solo con `ImageDecoder` (no existe en Firefox/Safari); máximo 300 cuadros.                                             |
| 23 | Encuadre                                  | Contener, cubrir, estirar, 1:1; escala, desplazamiento, rotación 90°, volteos, fondo para transparencia.              |
| 24 | Niveles                                   | Negro, blanco, gamma, brillo, contraste, histograma, auto-niveles.                                                     |
| 25 | Conversión a 1 bit                        | Umbral, Floyd–Steinberg, Atkinson, Sierra Lite, Bayer 4×4/8×8, ruido; "encendido = oscuros/claros"; invertir.         |
| 26 | Aplicar imagen                            | Reemplazar, superponer (OR), como fotograma nuevo, importar secuencia.                                                 |
| 27 | Exportar Adafruit_GFX                     | Filas MSB; `PROGMEM` opcional.                                                                                         |
| 28 | Exportar U8g2                             | Filas LSB (XBM); `U8X8_PROGMEM` opcional.                                                                              |
| 29 | Exportar páginas verticales               | Bit 0 arriba, páginas de 8 filas.                                                                                      |
| 30 | Exportar binario Arduino                  | Literales `B01010101`.                                                                                                 |
| 31 | Exportar ASCII art                        | `#` y `.`.                                                                                                             |
| 32 | Exportar caracteres personalizados        | Solo del fotograma actual, `0b…`.                                                                                      |
| 33 | Exportar Arduino LiquidCrystal / I²C      | Sketch con `createChar`; animación con `memcpy_P`/`pgm_read_*`.                                                        |
| 34 | Exportar PIC XC8                          | `lcd.h`, `lcd.c`, `anim.h`, `anim.c`, `main.c`; PIC16F877A, PIC18F4550, "otro PIC16/18".                               |
| 35 | ZIP                                       | ZIP sin compresión escrito a mano para el proyecto XC8.                                                                |
| 36 | PNG / hoja de sprites / GIF               | `canvas.toBlob` para PNG; GIF89a propio con LZW; hoja de sprites horizontal.                                           |
| 37 | Copiar código                             | `navigator.clipboard` con alternativa `execCommand('copy')`.                                                            |
| 38 | Guardar / abrir proyecto                  | Descarga de `.lcdstudio.json`; apertura con `JSON.parse` sin validar.                                                   |
| 39 | Ayuda                                     | `<dialog>` con tabla de atajos.                                                                                        |
| 40 | Atajos                                    | P E L R C F T S, Ctrl+Z/Y, `,` `.`, espacio, O, flechas, Esc, Supr.                                                    |

## 2. Defectos y riesgos encontrados

| Ref. | Defecto                                                                                                                                                             | Gravedad |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| D1   | Las celdas que exceden 8 caracteres CGRAM se **sustituyen silenciosamente por espacios** en el código generado (solo un comentario `⚠`).                              | Crítica  |
| D2   | La "coincidencia ROM" asume que una fuente 5×7 genérica coincide con la ROM A00 del HD44780. No está verificado; produce texto distinto al dibujado.                 | Alta     |
| D3   | LCD de caracteres personalizadas de hasta 16 filas, pero el generador XC8 solo conoce 4 offsets DDRAM (`row & 3`) → filas 5–16 sobrescriben las 1–4.               | Crítica  |
| D4   | 8×2, 24×2, 40×2 y 16×1 sin mapa DDRAM documentado; 16×1 tiene variantes con dos mitades (0x00/0x40) que el código no maneja.                                        | Alta     |
| D5   | Arduino multi-fotograma usa siempre `memcpy_P`/`pgm_read_*`, aunque la casilla PROGMEM esté desactivada → lee basura de flash.                                       | Crítica  |
| D6   | Índices `uint8_t` para recorrer fotogramas (`for (uint8_t i …)`) con más de 255 fotogramas posibles.                                                                | Alta     |
| D7   | XC8 en modo "una vez": `anim_next()` devuelve 0 y `main` lo llama sin fin (ciclo ocupado).                                                                          | Media    |
| D8   | XC8 acepta "otro PIC16/18" sin bits de configuración ni comprobación de puertos/memoria; nunca se compiló con XC8.                                                  | Alta     |
| D9   | Pines no válidos se reemplazan silenciosamente por valores por defecto; pines duplicados solo generan aviso.                                                        | Alta     |
| D10  | Dirección I²C y pines de LiquidCrystal se insertan como texto libre en el código (inyección de código arbitrario en el sketch).                                     | Media    |
| D11  | Apertura de proyectos sin validación: dimensiones, longitudes, base64, colores y número de fotogramas no se comprueban; un archivo dañado deja el editor a medias.   | Crítica  |
| D12  | `localStorage` con errores silenciados: si la cuota se llena, el autoguardado falla sin aviso.                                                                       | Alta     |
| D13  | Historial de 120 instantáneas completas sin presupuesto de memoria (512×512×240×120 ≈ 7,5 GB teóricos).                                                             | Alta     |
| D14  | GIF animado depende de `ImageDecoder` (solo Chromium); en Firefox/Safari importa solo el primer cuadro sin avisar.                                                  | Alta     |
| D15  | Imágenes sin límite de tamaño comprimido ni decodificado antes de reservar memoria.                                                                                 | Alta     |
| D16  | Todo el procesamiento de imagen bloquea el hilo principal.                                                                                                          | Media    |
| D17  | PNG mediante `canvas.toBlob`: bytes distintos entre navegadores (no determinista).                                                                                  | Media    |
| D18  | GIF: duración redondeada a centésimas sin aviso; mínimo forzado a 20 ms sin informar.                                                                              | Baja     |
| D19  | Nombres de archivo derivados del nombre de variable sin longitud máxima.                                                                                            | Baja     |
| D20  | `innerHTML` con datos interpolados (nombres de archivo en pestañas).                                                                                                | Media    |
| D21  | Estilos inline y manejadores asignados por propiedad; imposible aplicar CSP estricta sin `unsafe-inline`.                                                           | Media    |
| D22  | Botones solo con icono sin nombre accesible; lienzo sin alternativa de teclado; `alert()` para errores.                                                            | Alta     |
| D23  | El código Arduino de una sola imagen dejaba `loop()` vacío, y el multi-fotograma no respetaba el modo "una vez".                                                   | Media    |
| D24  | Fotograma "borrar" con un único fotograma limpiaba el contenido en vez de impedir la operación.                                                                    | Baja     |
| D25  | Duración mínima 10 ms (navegadores y GIF no la respetan).                                                                                                           | Baja     |

## 3. Matriz de decisiones

Leyenda: **Conservar** (mismo comportamiento, código nuevo), **Corregir**
(misma función, defecto arreglado), **Rediseñar** (cambia el modelo o la
interacción), **Eliminar** (fuera del producto).

| #  | Función                                  | Decisión   | Detalle                                                                                                                                                              |
| -- | ---------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1  | Presets de caracteres                    | Rediseñar  | Perfiles explícitos con controlador, DDRAM, CGRAM y ROM. Solo HD44780 16×2, 20×2, 16×4 y 20×4 (D3, D4).                                                              |
| 1b | LM016L                                   | Rediseñar  | Es un HD44780 16×2: se representa con el perfil `hd44780-16x2`; la paleta "LM016L" se conserva como tema visual.                                                     |
| 1c | 16×1, 8×2, 24×2, 40×2                    | Eliminar   | Sin mapa DDRAM verificado. Los proyectos v1 que los usen se migran a gráfico personalizado con aviso.                                                                 |
| 2  | LCD de caracteres personalizada          | Eliminar   | No se puede exportar correctamente sin offsets DDRAM explícitos (D3). Queda documentado como trabajo futuro en modo avanzado.                                        |
| 3  | Gráfica personalizada                    | Corregir   | 1–512 × 1–512 con validación centralizada de memoria.                                                                                                                |
| 3b | Presets gráficos                         | Rediseñar  | Perfiles con controlador (SSD1306 128×64/128×32, PCD8544 84×48, KS0108 128×64) más "Gráfica personalizada".                                                           |
| 4  | Temas LCD                                | Conservar  | Mismas paletas; colores validados (`#rrggbb`). Solo afectan a la vista, PNG, hoja y GIF.                                                                              |
| 5  | Tema Windows 2000 claro/oscuro           | Corregir   | Variables CSS sin estilos inline; contraste revisado; foco visible.                                                                                                  |
| 6  | Lápiz / goma                             | Conservar  | Además: edición con teclado (cursor de píxel).                                                                                                                       |
| 7  | Línea, rectángulo, elipse                | Conservar  | Algoritmos aislados y probados; relleno/contorno.                                                                                                                    |
| 8  | Relleno por área                         | Conservar  | Scanline 4-conexo probado con límites.                                                                                                                               |
| 9  | Texto                                    | Corregir   | Fuente 5×7 propia; el texto se dibuja como píxeles (en LCD de caracteres ocupa CGRAM salvo coincidencia ROM demostrable).                                           |
| 10 | Selección y portapapeles                 | Conservar  | Mover, copiar, cortar, pegar, borrar; portapapeles interno.                                                                                                          |
| 11 | Deshacer / rehacer                       | Rediseñar  | Estados inmutables con estructura compartida; máx. 100 pasos y 128 MB (D13).                                                                                         |
| 12 | Simetría                                 | Conservar  |                                                                                                                                                                      |
| 13 | Transformaciones                         | Conservar  | Invertir, limpiar, voltear, desplazar; actual o todos.                                                                                                               |
| 14 | Fotogramas                               | Corregir   | Duración 20–60 000 ms (D25); máximo 240; no se borra el último (D24); reordenar también con teclado y arrastre.                                                     |
| 15 | Reproducción                             | Conservar  | Bucle, ida y vuelta, una vez; el modo se guarda en el proyecto y lo respetan GIF y código.                                                                           |
| 16 | Papel cebolla                            | Conservar  | Señala anterior/siguiente con forma además de color (no depende solo del color).                                                                                     |
| 17 | Zoom y ajuste                            | Conservar  | Lienzo con tamaño máximo para no reservar superficies gigantes.                                                                                                      |
| 18 | Rejilla                                  | Conservar  |                                                                                                                                                                      |
| 19 | Análisis CGRAM                           | Corregir   | Bloquea la exportación y enumera fila/columna de cada celda incompatible (D1).                                                                                       |
| 20 | Coincidencia ROM                         | Rediseñar  | El usuario elige el mapa ROM. Por defecto "ninguno": solo celdas vacías → espacio (0x20). La tabla A00 se ofrece como experimental hasta verificarla (D2).             |
| 21 | Importar imágenes                        | Corregir   | Firma de archivo, 20 MB comprimido, 16 MP decodificado, Web Worker, progreso, cancelación (D15, D16).                                                                 |
| 22 | GIF animado                              | Rediseñar  | Decodificador en JavaScript (`gifuct-js`) en todos los navegadores, composición con métodos de eliminación probada (D14).                                             |
| 23 | Encuadre                                 | Conservar  | Remuestreo propio en TypeScript (determinista), no `drawImage`.                                                                                                      |
| 24 | Niveles                                  | Conservar  | Histograma, auto-niveles.                                                                                                                                            |
| 25 | Tramado                                  | Corregir   | Floyd–Steinberg, Atkinson, Sierra Lite, Bayer 4×4/8×8. "Ruido" se elimina (no pedido, no aporta frente a Bayer).                                                     |
| 26 | Aplicar imagen                           | Conservar  | Reemplazar, OR, fotograma nuevo, secuencia; respeta el límite de 240 fotogramas.                                                                                     |
| 27 | Adafruit_GFX                             | Corregir   | `PROGMEM` obligatorio y explicado (la sobrecarga `const uint8_t[]` lee con `pgm_read_byte`); tabla de punteros; `uint16_t` donde corresponde (D5, D6).             |
| 28 | U8g2                                     | Corregir   | `drawXBMP` + `U8X8_PROGMEM` con PROGMEM; `drawXBM` en RAM sin PROGMEM (D5).                                                                                         |
| 29 | Páginas verticales                       | Conservar  | Pruebas doradas; altura no múltiplo de 8 rellena con ceros.                                                                                                          |
| 30 | Binario Arduino `B0101…`                 | Rediseñar  | Sustituido por "Datos binarios" (`.bin` crudo con empaquetado elegible) — los literales `Bxxxxxxxx` están obsoletos en Arduino.                                     |
| 31 | ASCII art                                | Conservar  |                                                                                                                                                                      |
| 32 | Caracteres personalizados                | Corregir   | Todos los fotogramas seleccionados, deduplicados, bloqueando si un fotograma excede 8.                                                                               |
| 33 | LiquidCrystal / LiquidCrystal_I2C        | Corregir   | Exportadores separados; validación de pines, placa, dirección I²C, memoria; sin inyección de texto; modo "una vez" detiene el MCU (D5–D10, D23).                   |
| 34 | PIC XC8                                  | Corregir   | Solo PIC16F877A y PIC18F4550, **experimental** (no se ha compilado con XC8); "otro PIC" eliminado (D7, D8).                                                          |
| 35 | ZIP                                      | Conservar  | Escritor propio, nombres saneados, sin rutas; pruebas de CRC y estructura.                                                                                           |
| 36 | PNG / hoja / GIF                         | Corregir   | Codificadores propios deterministas (PNG indexado con `fflate`, GIF89a LZW) (D17, D18).                                                                              |
| 37 | Copiar código                            | Conservar  | Solo `navigator.clipboard`; si no está disponible se informa y se ofrece descargar.                                                                                  |
| 38 | Guardar / abrir proyecto                 | Rediseñar  | Formato v2 versionado, validación estricta con Zod, migración v1, recuperación IndexedDB; escritorio con diálogos nativos y escritura atómica (D11, D12).            |
| 39 | Ayuda                                    | Conservar  | Diálogo accesible con atajos.                                                                                                                                        |
| 40 | Atajos                                   | Conservar  | Documentados en `docs/` y en la ayuda; no se activan mientras se escribe en un campo.                                                                                |
| —  | Iconos `data:` generados en tiempo real  | Rediseñar  | Iconos SVG pixel-art en componentes, ocultos a lectores de pantalla.                                                                                                 |
| —  | `alert()`                                | Eliminar   | Notificaciones en región `aria-live`.                                                                                                                                |
| —  | `localStorage` para el proyecto          | Eliminar   | IndexedDB con copia anterior; `localStorage` solo para preferencias de interfaz.                                                                                     |

## 4. Algoritmos reutilizados tras aislarlos

| Algoritmo                    | Origen                         | Destino                         | Prueba                                      |
| ---------------------------- | ------------------------------ | ------------------------------- | ------------------------------------------- |
| Línea de Bresenham           | prototipo `lineAlg`            | `src/engine/geometry.ts`        | `tests/unit/engine/geometry.test.ts`        |
| Elipse por rectángulo (Zingl)| prototipo `ellipseAlg`         | `src/engine/geometry.ts`        | `tests/unit/engine/geometry.test.ts`        |
| Relleno scanline             | prototipo `floodFill`          | `src/engine/fill.ts`            | `tests/unit/engine/fill.test.ts`            |
| Kernels de difusión de error | prototipo `KERN`               | `src/engine/dither.ts`          | `tests/unit/engine/dither.test.ts`          |
| Matriz de Bayer recursiva    | prototipo `bayer`              | `src/engine/dither.ts`          | `tests/unit/engine/dither.test.ts`          |
| CRC-32                       | prototipo `crc32`              | `src/core/crc32.ts`             | `tests/unit/core/crc32.test.ts`             |
| LZW de GIF                   | prototipo `gifLZW`             | `src/exporters/gif/lzw.ts`      | `tests/unit/exporters/gif.test.ts`          |
| Empaquetado de bits v1       | prototipo `packBits`           | `src/core/bitpack.ts`           | `tests/unit/core/bitpack.test.ts`           |
