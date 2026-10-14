# Arquitectura

Una sola base de código TypeScript produce la aplicación web estática, la PWA
y la aplicación de escritorio (Tauri 2). No hay servidor de aplicación: todo
el procesamiento ocurre en el dispositivo.

```
                ┌──────────────────────────── src/ui (React) ───────────────────────────┐
                │ App · menús · panel Dibujo/Imagen · lienzo · línea de tiempo ·        │
                │ asistentes (proyecto, exportación, conversión) · i18n (es/en)          │
                │ EditorStore (estado + historial) · LimitNotice · ToastStore · prefs.   │
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
                          │ src/device-profiles│ perfiles LCD/OLED/LED, capacidades, ROM, placas
                          └──────────────────┘
```

## Capas

| Carpeta | Responsabilidad | Depende de |
| ------- | --------------- | ---------- |
| `src/core/` | Límites (`limits.ts`), errores con código, modelo de proyecto inmutable, formato v3 y migraciones v2/v1, configuración del dispositivo (`device.ts`), **validación de restricciones** (`constraints.ts`), edición de patrones compartidos (`pattern-edit.ts`), conversión de pantalla (`convert.ts`), patrones de diagnóstico LED, historial con presupuesto, reproducción, análisis CGRAM, base64, CRC-32, ZIP, saneamiento de nombres. | `device-profiles`, `zod` |
| `src/engine/` | Geometría (Bresenham, elipse de Zingl), relleno, dibujo con simetría, selección, transformaciones, texto 5×7, y procesamiento de imágenes (firma de archivo, remuestreo, niveles, tramados, GIF). | `core`, `omggif` |
| `src/exporters/` | Un módulo por formato, contenido exportable y formatos compatibles (`content.ts`), codificadores PNG/GIF, empaquetados, datos MAX7219, validación AVR, registro único. | `core`, `engine`, `fflate` |
| `src/device-profiles/` | Perfiles HD44780, gráficos y matriz LED; conexiones y destinos de código válidos (`capabilities.ts`); tabla ROM A00; placas Arduino y PIC. | — |
| `src/storage/` | Recuperación en IndexedDB (actual + anterior), autoguardado con estado, preferencias en `localStorage`. | `core` |
| `src/platform/` | Interfaz `Platform` con adaptador web (selector y descargas) y Tauri (comandos Rust). | — |
| `src/workers/` | Workers de imágenes, exportación y proyectos, con clientes que cancelan terminando el worker. | `core`, `engine`, `exporters` |
| `src/ui/` | Componentes React, estado del editor, renderizador del lienzo, i18n, PWA. | todo lo anterior |
| `src-tauri/` | Solo funciones nativas: diálogos, escritura atómica, empaquetado. | Tauri 2 |

`core`, `engine`, `exporters` y `device-profiles` son TypeScript puro: no
usan el DOM, React ni Tauri y se prueban directamente en Node (Vitest).

## Flujo de datos

- **Edición**: el `EditorStore` mantiene un proyecto inmutable. Un trazo
  trabaja sobre una copia del fotograma (vista previa temporal, separada del
  estado confirmado); el lienzo se redibuja en el siguiente
  `requestAnimationFrame` actualizando solo la región modificada del mapa de
  bits auxiliar. Al soltar, el cambio se registra en el historial.
- **Restricciones**: todo cambio del proyecto pasa por `EditorStore.commit`,
  que valida el resultado completo con `validateTransition`
  (`src/core/constraints.ts`). Si no está permitido no cambia nada (ni
  historial, ni revisión, así que tampoco hay autoguardado) y se emite un
  evento `limit` que gestiona el aviso único (`LimitNotice`). La importación,
  los atajos y los menús usan el mismo camino; la exportación de código
  vuelve a comprobar el límite con las celdas exactas.
- **Dispositivo**: la conexión, el destino de código y la configuración
  física de la matriz LED se guardan en el proyecto (`device`). Las
  combinaciones válidas salen de `src/device-profiles/capabilities.ts`; el
  asistente, la configuración, la conversión y la exportación las consultan
  ahí en vez de repetirlas en la interfaz.
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
- **Exportar**: asistente en cuatro pasos (contenido, tipo y formato,
  opciones, resultado). `src/exporters/content.ts` decide qué formatos admite
  cada contenido y por qué no los demás; la selección se exporta como un
  proyecto gráfico del tamaño del rectángulo. La validación, la estimación de
  memoria y la generación ocurren en el worker de exportación; nada se guarda
  hasta pulsar «Guardar». Web y escritorio guardan los mismos bytes con su
  adaptador de plataforma.
- **Miniaturas**: la línea de tiempo usa un tamaño uniforme (zoom o ajuste
  con mínimo legible, `timeline-layout.ts`), dibuja cada miniatura a su
  tamaño mostrado solo cuando entra en la vista (IntersectionObserver) y en
  una cola que cede el hilo cada 8 ms.
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

## Interfaz

- Barra de menús (`MenuBar.tsx`, patrón WAI-ARIA menubar): Archivo (nuevo,
  abrir, guardar, guardar como, preferencias), Editar, Proyecto
  (configuración, convertir pantalla, ajustar a 8 caracteres, patrones de
  diagnóstico), Exportar y Ayuda. Las ventanas emergentes usan `<dialog>`
  modal: Escape, foco inicial y devolución del foco; cancelar no aplica nada.
- Vista única de trabajo: herramientas, lienzo, panel lateral (Dibujo e
  Imagen) y línea de tiempo a la vez. El panel se retrae; por debajo de
  1 024 px es un cajón superpuesto. En móvil vertical las herramientas forman
  una fila y la línea de tiempo se puede plegar; en móvil horizontal todo es
  compacto y lienzo y línea de tiempo siguen visibles. Los componentes no se
  desmontan al cambiar de orientación, así que se conserva el estado.

## Siete segmentos (preparación)

Todos los perfiles declaran `content: 'raster'` y el editor solo trabaja con
ese modelo. Un display de siete segmentos tendrá su propio modelo
(segmentos a–g + punto decimal) y su propio editor; las capacidades de
conexión y destino se añadirán en `capabilities.ts` igual que las demás
familias. No está implementado.

## Decisiones

Ver `docs/decisions.md`.
