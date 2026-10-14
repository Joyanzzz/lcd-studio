# Pruebas

| Comando | Qué ejecuta |
| ------- | ----------- |
| `npm run test` | Pruebas unitarias (Vitest, Node). |
| `npm run test:coverage` | Igual, con cobertura y umbrales del 90 %. |
| `npm run test:e2e` | Pruebas end-to-end (Playwright) contra `vite preview`. |
| `npm run lint` | ESLint (sin avisos permitidos) y Prettier. |
| `npm run typecheck` | TypeScript estricto en app, scripts y pruebas. |
| `cargo test --release` (en `src-tauri/`) | Pruebas de la parte Rust. |
| `ARDUINO_CLI=… npm run arduino:check` | Compila 31 bocetos Arduino generados y compara la memoria estimada con la real ([resultados](hardware-validation.md)). |
| `npm run bench` | Mediciones de las operaciones del núcleo ([resultados](performance.md)). |
| `npm run bench:browser` | Tareas largas y FPS en Chromium contra `npm run preview` ([resultados](performance.md)). |

## Unitarias (`tests/unit/`)

- **core**: límites y aritmética comprobada; empaquetado de bits; base64
  (vectores RFC 4648 y casos manipulados); CRC-32 (vectores conocidos); ZIP
  (estructura, CRC, determinismo, nombres inseguros, ZIP Slip); nombres;
  proyecto e invariantes; formato v2 (ida y vuelta, 20 manipulaciones,
  512×512×240); migración v1 con archivos válidos, dañados, truncados,
  sobredimensionados y manipulados (`tests/fixtures/projects/`); historial
  (orden, profundidad, presupuesto de 128 MiB con 512×512); reproducción;
  análisis CGRAM y plan de animación.
- **engine**: línea, rectángulo y elipse (dorados y casos degenerados),
  relleno (512×512 y laberinto), transformaciones, selección, texto,
  detección de formato de imagen y límites, remuestreo, niveles, tramados
  (propiedades y determinismo), decodificación GIF (transparencia,
  eliminación 2 y 3, progreso, cancelación, archivos dañados).
- **exporters**: empaquetados MSB/LSB/páginas con patrones dorados (píxel
  aislado, tablero, diagonales, bordes, vacío, lleno, tamaños no múltiplo de
  8); PNG (chunks, CRC, descompresión); GIF/LZW con decodificador
  independiente (`omggif`), incluido reinicio del diccionario; cada
  exportador (contenido, opciones, validaciones, bloqueo CGRAM, memoria AVR,
  pines, I²C, PROGMEM, `uint16_t`, modos de reproducción); determinismo de
  todos los formatos.
- **storage**, **workers**, **ui/editor-store**, **i18n** (paridad de claves,
  marcadores, claves usadas por el código, formato numérico, detección de
  idioma).

## End-to-end (`tests/e2e/`)

Se ejecutan contra la compilación de producción (`npm run build && npm run
preview`), que incluye la CSP y el service worker, en 8 proyectos:
Chromium, Firefox, WebKit y móvil (Pixel 7) × español e inglés. El idioma del
navegador determina el idioma de la interfaz en el primer inicio, así que
todas las pruebas se ejecutan en ambos idiomas; los textos esperados salen de
los mismos diccionarios.

Cubren: crear, editar, guardar, cerrar y reabrir; recuperación tras recarga;
importar PNG y GIF; reordenar fotogramas (teclado y arrastre); deshacer y
rehacer; exportar **todos** los formatos de un perfil de caracteres y de uno
OLED comparando los bytes descargados con los del núcleo; rechazo de archivos
dañados y sobredimensionados sin perder el proyecto; proyecto de 512×512 con
100 fotogramas; edición solo con teclado; foco de diálogos; diseño de
escritorio y móvil (360 px sin desplazamiento horizontal); tema claro y oscuro
con axe-core (WCAG 2.1 AA, sin infracciones graves); ausencia de peticiones a
otros orígenes y de errores de consola; funcionamiento sin conexión.

### Igualdad web/escritorio

La aplicación de escritorio carga el mismo JavaScript en WebView2, un
navegador basado en Chromium; la única diferencia del `dist/` es que omite la
CSP en `<meta>`, porque en escritorio la aplica Tauri. La prueba de
exportación demuestra que el código de la interfaz entrega byte a byte lo que
produce el núcleo; en escritorio esos bytes se envían sin transformar a Rust,
que solo los escribe (prueba unitaria de escritura atómica en `src-tauri`).
No hay una prueba automatizada que conduzca la ventana Tauri.

## Cobertura

`npm run test:coverage` exige ≥ 90 % de líneas, ramas, funciones y
sentencias en `src/core`, `src/engine`, `src/exporters` y
`src/device-profiles`. La cobertura no sustituye a los casos límite: ver la
lista de arriba.

## Arduino

```bash
ARDUINO_CLI=arduino-cli node scripts/arduino-check.ts
```

Requiere `arduino-cli` con el núcleo `arduino:avr` y las bibliotecas
indicadas en `docs/hardware-validation.md`. CI lo ejecuta en cada cambio.
