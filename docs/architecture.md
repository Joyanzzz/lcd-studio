# Arquitectura

Una sola base de código TypeScript produce la aplicación web estática, la PWA
y la aplicación de escritorio (Tauri 2). No hay servidor de aplicación: todo
el procesamiento ocurre en el dispositivo.

```
                ┌──────────────────────────── src/ui (React) ───────────────────────────┐
                │ App · paneles · lienzo · línea de tiempo · diálogos · i18n (es/en)     │
                │ EditorStore (estado + historial) · ToastStore · preferencias           │
                └───────┬─────────────────────┬──────────────────────┬───────────────────┘
                        │                     │                      │
          ┌─────────────▼──────┐   ┌──────────▼─────────┐   ┌────────▼───────────┐
          │ src/workers        │   │ src/storage        │   │ src/platform       │
          │ imágenes · export. │   │ IndexedDB · autog. │   │ web  │  tauri      │
          │ · proyectos        │   │ · preferencias     │   └──┬───┴─────┬───────┘
          └───┬───────┬────────┘   └────────────────────┘      │         │ IPC (bytes)
              │       │                                         │   ┌─────▼────────────┐
   ┌──────────▼─┐ ┌───▼────────────┐ ┌─────────────────┐        │   │ src-tauri (Rust) │
   │ src/engine │ │ src/exporters  │ │ src/core        │◄───────┘   │ diálogos nativos │
   │ píxeles ·  │ │ un módulo por  │ │ modelo · límites│            │ escritura atómica│
   │ imágenes   │ │ formato        │ │ formato · CGRAM │            └──────────────────┘
   └─────┬──────┘ └───────┬────────┘ └───────┬─────────┘
         └────────────────┴────────┬─────────┘
                          ┌────────▼─────────┐
                          │ src/device-profiles│ perfiles LCD/OLED, ROM, placas
                          └──────────────────┘
```

## Capas

| Carpeta | Responsabilidad | Depende de |
| ------- | --------------- | ---------- |
| `src/core/` | Límites (`limits.ts`), errores con código, modelo de proyecto inmutable, formato v2 y migración v1, historial con presupuesto, reproducción, análisis CGRAM, base64, CRC-32, ZIP, saneamiento de nombres. | `device-profiles`, `zod` |
| `src/engine/` | Geometría (Bresenham, elipse de Zingl), relleno, dibujo con simetría, selección, transformaciones, texto 5×7, y procesamiento de imágenes (firma de archivo, remuestreo, niveles, tramados, GIF). | `core`, `omggif` |
| `src/exporters/` | Un módulo por formato, codificadores PNG/GIF, empaquetados, validación AVR, registro único. | `core`, `engine`, `fflate` |
| `src/device-profiles/` | Perfiles HD44780 y gráficos, tabla ROM A00, placas Arduino y PIC. | — |
| `src/storage/` | Recuperación en IndexedDB (actual + anterior), autoguardado con estado, preferencias en `localStorage`. | `core` |
| `src/platform/` | Interfaz `Platform` con adaptador web (selector y descargas) y Tauri (comandos Rust). | — |
| `src/workers/` | Workers de imágenes, exportación y proyectos, con clientes que cancelan terminando el worker. | `core`, `engine`, `exporters` |
| `src/ui/` | Componentes React, estado del editor, renderizador del lienzo, i18n, PWA. | todo lo anterior |
| `src-tauri/` | Solo funciones nativas: diálogos, escritura atómica, empaquetado. | Tauri 2 |

`core`, `engine`, `exporters` y `device-profiles` son TypeScript puro: no
usan el DOM, React ni Tauri y se prueban directamente en Node (Vitest).

## Flujo de datos

- **Edición**: el `EditorStore` mantiene un proyecto inmutable. Un trazo
  trabaja sobre una copia del fotograma; el lienzo se redibuja en el siguiente
  `requestAnimationFrame` actualizando solo la región modificada del mapa de
  bits auxiliar. Al soltar, el cambio se registra en el historial.
- **Historial**: estados completos que comparten los arreglos de píxeles no
  modificados. Coste = bytes que solo retiene ese estado. Límite: 100 pasos y
  128 MiB; si una operación por sí sola supera el presupuesto, se avisa de que
  no se podrá deshacer.
- **Autoguardado**: cada cambio programa (600 ms) una serialización en el
  worker de proyectos y una escritura en IndexedDB. Hay dos ranuras que se
  alternan (`slot-a`/`slot-b`) y un puntero que indica cuál es la actual; la
  escritura de la ranura y del puntero va en una sola transacción, así que la
  copia anterior nunca se lee ni se copia. Estado visible: sin cambios,
  pendiente, guardando, guardado o error.
- **Copia de fotogramas en los workers**: los workers de proyectos y de
  exportación guardan su propia copia de los fotogramas. El hilo principal
  solo envía los fotogramas nuevos o modificados (identificados por la
  identidad de su arreglo de píxeles); el resto viaja como referencia. Si un
  worker se termina por cancelación, la copia se descarta y el siguiente envío
  es completo.
- **Abrir**: plataforma → bytes → worker de proyectos (validación completa) →
  solo si es válido se sustituye el proyecto.
- **Exportar**: las opciones se normalizan en el hilo principal; la
  validación y la estimación de memoria (que en LCD de caracteres analiza
  todos los fotogramas) se piden al worker de exportación con 120 ms de
  espera tras el último cambio, y el botón de generar queda bloqueado hasta
  tener el resultado. La generación también ocurre en el worker. Web y
  escritorio guardan los mismos bytes con su adaptador de plataforma.
- **Miniaturas**: la línea de tiempo dibuja miniaturas reducidas (máx.
  150×52) en una cola que cede el hilo cada 8 ms.
- **Imágenes**: el worker valida firma y dimensiones antes de decodificar,
  reduce a una copia de trabajo (luminancia + alfa, máx. 2 048 px y 192 MiB) y
  aplica encuadre, niveles y tramado con aritmética entera determinista.

## Internacionalización

El núcleo nunca produce texto: devuelve códigos (`project.tooManyFrames`) con
parámetros. `src/ui/i18n/es.ts` es la fuente de las claves; `en.ts` debe tener
las mismas (TypeScript lo exige) y una prueba comprueba claves, marcadores y
que todo código usado por núcleo y exportadores exista en ambos idiomas.
El idioma se detecta del sistema solo en el primer inicio y después se guarda.
El contenido de los archivos generados (comentarios del código, formato de
proyecto) no depende del idioma de la interfaz, para que la salida sea
determinista.

## Decisiones

Ver `docs/decisions.md`.
