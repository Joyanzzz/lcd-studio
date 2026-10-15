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
  proyecto e invariantes; formato v3 (ida y vuelta con `device`, 24
  manipulaciones, 512×512×240) y migración v2 → v3 sin pérdida; migración v1 con archivos válidos, dañados, truncados,
  sobredimensionados y manipulados (`tests/fixtures/projects/`); historial
  (orden, profundidad, presupuesto de 128 MiB con 512×512); reproducción;
  análisis CGRAM y plan de animación; ajuste a 8 caracteres (sin cambios si
  ya cabe, límite de 8 glifos, peso de las repeticiones, determinismo e
  idempotencia, ROM A00, 20×4 con todas las celdas distintas, alcance y
  pantallas gráficas); restricción de 8 patrones (repetir permitido, noveno
  rechazado, ROM que no consume ranura, quitar la ROM, fotogramas nuevos,
  reparación que mantiene/reduce y rechaza aumentar), celdas no disponibles,
  propagación de patrones compartidos; conversión de pantalla (recorte,
  centrado, escala, informe, reglas por familia, matriz LED).
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
  todos los formatos; proyecto en reparación (código bloqueado, imágenes con
  aviso); MAX7219: bytes conocidos, barridos, giro de 90°, y para cada
  patrón de diagnóstico × 4 giros × 4 cableados un módulo simulado que
  decodifica los registros y gira la imagen debe mostrar exactamente el
  dibujo; boceto y datos binarios coinciden con los registros.
- **ui/editor-store** (límite: trazo rechazado entero al soltar con un solo
  aviso, sin historial/revisión/modificado; repetir con la paleta y pegar;
  copia frente a edición global; texto, transformación, importación;
  reparación; limpieza al cambiar de proyecto), **ui/limit-notice** (visible
  durante el intento, 5 s después, reutilización, cierre, sin anuncios
  repetidos), **ui/timeline-layout** (proporción, mínimo legible con 240
  fotogramas, tamaño uniforme).
- **storage**, **workers**, **i18n** (paridad de claves,
  marcadores, claves usadas por el código, formato numérico, detección de
  idioma).

## End-to-end (`tests/e2e/`)

Se ejecutan contra la compilación de producción (`npm run build && npm run
preview`), que incluye la CSP y el service worker, en 8 proyectos:
Chromium, Firefox, WebKit y móvil (Pixel 7) × español e inglés. El idioma del
navegador determina el idioma de la interfaz en el primer inicio, así que
todas las pruebas se ejecutan en ambos idiomas; los textos esperados salen de
los mismos diccionarios.

Cubren: asistente de nuevo proyecto (y «solo diseño»), editar, guardar
(formato v3), cerrar y reabrir con la configuración del dispositivo
restaurada; migración v2 y v1; recuperación tras recarga; importar PNG y GIF;
reordenar fotogramas (teclado y arrastre); deshacer y rehacer; **límite de 8
patrones** (repetir con la paleta, noveno rechazado sin paso de deshacer, un
único aviso visible durante el intento y oculto 5 s después con reloj
simulado, cierre con Escape), copia frente a edición global de un patrón
repetido, **proyecto en reparación** (se abre, código bloqueado, imágenes
con aviso, reparar y guardar) y ajuste a 8 caracteres; exportar **todos** los
formatos de un perfil de caracteres, uno OLED y la matriz LED con el
asistente, comparando los bytes descargados con los del núcleo; formatos
incompatibles con el contenido deshabilitados; cancelar el asistente sin
archivos; configuración y conversión canceladas sin cambios; conversión con
vista previa, copia del original y deshacer; matriz LED con giro, cableado y
patrones de diagnóstico; menús con teclado y devolución del foco; rechazo de
archivos dañados y sobredimensionados sin perder el proyecto; proyecto de
512×512 con 100 fotogramas; línea de tiempo con 240 fotogramas (mínimo
legible, desplazamiento, selección visible, zoom); edición solo con teclado;
diseño de escritorio, móvil vertical (360 px, cajón, línea de tiempo
plegable) y móvil horizontal (740×360, lienzo y línea de tiempo visibles);
cambio de orientación conservando fotograma, selección y reproducción; tema
claro y oscuro con axe-core (WCAG 2.1 AA, sin infracciones graves); ausencia
de peticiones a otros orígenes y de errores de consola; funcionamiento sin
conexión.

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

## Firefox en el equipo de desarrollo

Las pruebas E2E de Firefox están configuradas (`firefox-es`, `firefox-en` en
`playwright.config.ts`) y la CI las ejecuta (`.github/workflows/ci.yml`,
matriz `e2e`). En el equipo de desarrollo **no arrancan**: Windows rechaza
ejecutar `firefox.exe` desde la carpeta de navegadores de Playwright
(`browserType.launch: spawn UNKNOWN`, comprobado el 2026-10-14), lo que
apunta a una política de control de aplicaciones del equipo. No se ha
eludido. Hasta que la CI se ejecute en GitHub, Firefox cuenta como **no
probado**.

## Comprobaciones manuales (1.1.0-beta.1)

Hechas el 2026-10-14 sobre el árbol final sin confirmar (ver
`docs/release.md` para repetirlas al publicar):

- **Actualización de la PWA**: se sirvió la compilación de la versión
  anterior (1.0.0, commit `a24aef0`) en un origen local, se dibujó sin
  guardar y se publicó la 1.1.0-beta.1 en el mismo origen. Apareció el aviso
  de versión nueva sin recargar sola; al aceptarlo, la página pasó a
  1.1.0-beta.1, quedó solo la caché nueva, no se pidió ningún recurso de la
  versión anterior (ni hubo 404) y el dibujo se recuperó.
- **Instalador de Windows**: ver
  [desktop-build.md](desktop-build.md#comprobación-manual-del-instalador).
- **Proyectos v2 reales**: `tests/fixtures/projects/v2-*.lcdstudio.json` los
  escribió el serializador de la versión 1.0.0 (commit `d8cb46d`), no el
  formato actual; `tests/unit/core/v2-fixtures.test.ts` comprueba que se
  migran sin pérdida y que guardar y reabrir los conserva.
