# Rendimiento

Objetivos: carga web inferior a 1,5 MB comprimida, 60 FPS, ninguna tarea de
más de 50 ms en el hilo de la interfaz, y abrir un proyecto de 512×512 con
100 fotogramas sin congelar la aplicación.

Todas las cifras de este documento son mediciones, no estimaciones, y se
pueden repetir con los scripts indicados. Equipo de referencia: AMD Ryzen 5
5500U, 18 GB de RAM, Windows 11, Node 24, Chromium de Playwright 1.63
(sin interfaz). Medición del 2026-10-13.

## Tamaño de la compilación web

`npm run build`; tamaños con gzip -9.

| Archivo | Sin comprimir | gzip |
| ------- | ------------: | ---: |
| `index.html` | — | 0,6 KB |
| JavaScript principal | 563 KB | 167 KB |
| CSS | 14 KB | 3,8 KB |
| Worker de proyectos (incluye Zod) | 178 KB | 52 KB |
| Worker de exportación | 77 KB | 25 KB |
| Worker de imágenes | 20 KB | 8 KB |
| Adaptador Tauri (solo escritorio) | 17 KB | 4,4 KB |
| Service worker | 2,6 KB | 1,2 KB |
| Avisos de licencia de terceros (no se cargan al abrir) | 477 KB | 55 KB |
| **Toda la carpeta `dist/` (tar.gz, con iconos y avisos)** | 1,35 MB | **320 KB** |

La aplicación no descarga nada más: no hay fuentes, CDN ni recursos remotos.
Vite avisa de que el fragmento principal supera 500 KB sin comprimir; no se
divide porque toda la interfaz se usa en la primera pantalla y la carga total
ya está muy por debajo del objetivo.

## Hilo de la interfaz (navegador)

`npm run build && npm run preview`, y en otra terminal
`npm run bench:browser` (`scripts/measure-browser.ts`). El script registra las
tareas largas con `PerformanceObserver` y mide el intervalo entre
`requestAnimationFrame` durante 2–3 s. Tres ejecuciones consecutivas:

| Escenario (512×512, 100 fotogramas) | Tareas > 50 ms | FPS | Intervalo p95 / máx. |
| ----------------------------------- | -------------: | --: | -------------------: |
| Abrir el archivo (4,2 MiB) | 0 | — | — |
| Reproducir | 0 | 60 | 16,8 / 16,8 ms |
| Dibujar con el ratón y autoguardar | 0 | 60 | 16,8 / 16,8 ms |
| Cambiar de fotograma | 0 | — | — |

El script comprueba que la reproducción avanza de verdad durante la medición.
Chromium sin interfaz sincroniza `requestAnimationFrame` a 60 Hz, así que
60 FPS es el máximo medible; lo relevante es que ningún intervalo supera
16,8 ms.

Qué lo hace posible:

- La validación, serialización y exportación ocurren en workers; el hilo de
  la interfaz solo envía los fotogramas nuevos o modificados (ver
  [arquitectura](architecture.md)).
- El lienzo se redibuja en `requestAnimationFrame` y solo en la región
  modificada.
- Las miniaturas se reducen (máx. 150×52) y se pintan en lotes de 8 ms.
- IndexedDB alterna dos ranuras en lugar de leer y copiar la anterior.

## Operaciones del núcleo (Node, un hilo)

`npm run bench` (`scripts/benchmark.ts`); mediana de 5 ejecuciones tras una de
calentamiento.

| Operación | Dónde se ejecuta | Mediana | Máx. |
| --------- | ---------------- | ------: | ---: |
| Serializar 512×512×100 (4,17 MiB) | worker de proyectos | 90 ms | 91 ms |
| Validar y abrir 512×512×100 | worker de proyectos | 73 ms | 77 ms |
| Imagen 2048² → 512×512 Floyd–Steinberg (primera) | worker de imágenes | 63 ms | 83 ms |
| Imagen 2048² → 512×512, cambio de parámetros | worker de imágenes | 21 ms | 66 ms |
| Imagen 2048² → 128×64 Bayer 8×8 | worker de imágenes | 1,0 ms | 1,1 ms |
| Relleno por área 512×512 | interfaz | 1,2 ms | 3,4 ms |
| Trazo de lápiz de 512 segmentos en 512×512 | interfaz | 2,7 ms | 3,9 ms |
| Exportar GIF 512×512×10 a escala 2 | worker de exportación | 315 ms | 315 ms |
| Exportar hoja de sprites 512×512×10 | worker de exportación | 112 ms | 128 ms |
| Exportar páginas verticales 512×512×10 | worker de exportación | 3,7 ms | 3,8 ms |
| Validar LiquidCrystal 20×4 × 240 fotogramas | worker de exportación | 19 ms | 20 ms |

Las operaciones de más de 50 ms solo ocurren dentro de workers, donde no
bloquean la interfaz, muestran progreso cuando procede y se pueden cancelar.

## Limitaciones de la medición

- Un solo equipo; no se ha medido en móviles reales ni en WebKit o Firefox
  (las pruebas E2E en esos navegadores comprueban el funcionamiento, no los
  tiempos).
- La aplicación de escritorio usa WebView2 (Chromium) con la misma
  compilación, pero sus tiempos no se han medido por separado.
