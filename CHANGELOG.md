# Registro de cambios

Formato basado en [Keep a Changelog](https://keepachangelog.com/es-ES/1.1.0/)
y versionado semántico.

## [Sin publicar]

### Corregido
- El workflow de publicación renombra el instalador (punto en lugar de
  espacio) antes de calcular `SHA256SUMS.txt`, para que coincida con el
  nombre que muestra GitHub. En 1.1.0-beta.1 se corrigió a mano el
  `SHA256SUMS.txt` publicado (mismos hashes).

## [1.1.0-beta.1] - 2026-10-14

Primera versión pública, en beta. Ninguna exportación se ha probado todavía
en hardware real (ver `docs/hardware-validation.md`); el instalador de
Windows no está firmado.

### Añadido
- Límite de 8 caracteres propios aplicado a todas las operaciones (trazo,
  formas, relleno, borrado, texto, pegado, mover, transformar, importar,
  cambiar la ROM): un resultado no permitido se rechaza entero, sin paso de
  deshacer, sin marcar el proyecto como modificado y sin autoguardado.
- Aviso único del límite (visible mientras dura el intento y 5 s después;
  se cierra con Escape), paleta de 8 ranuras con número de usos, celdas no
  disponibles atenuadas, herramienta «Colocar patrón» (G) y elección entre
  copiar o cambiar todas las apariciones de un patrón repetido.
- Estado de reparación para proyectos antiguos que superan el límite: se
  abren completos, se pueden editar sin aumentar los patrones y guardar; el
  código se bloquea y las imágenes avisan de que no certifican
  compatibilidad.
- Barra de menús (Archivo, Editar, Proyecto, Exportar, Ayuda) y ventanas
  emergentes para la configuración del proyecto y la exportación.
- Asistente de nuevo proyecto (familia, pantalla, conexión, plataforma,
  resumen) con opción «Solo diseño»; la configuración se guarda en el
  proyecto.
- Proyecto → Convertir pantalla con vista previa, informe de pérdidas,
  copia opcional del original y deshacer.
- Asistente de exportación (contenido, tipo y formato, opciones, resultado)
  con exportación de la selección, grupos Imágenes / Datos de mapa de bits /
  Código y ZIP como contenedor.
- Matriz de LEDs 8×8 con MAX7219: giro físico del módulo, cuatro perfiles de
  cableado, brillo, boceto Arduino sin bibliotecas, registros en binario o C
  y patrones de diagnóstico.
- Línea de tiempo con zoom, ajuste con anchura mínima legible, plegado,
  número de fotograma y duración diferenciados y miniaturas diferidas.
- Diseño adaptable: panel Dibujo/Imagen retraíble (cajón en pantallas
  pequeñas); en móvil, lienzo y línea de tiempo visibles a la vez en vertical
  y en horizontal.
- Iconos con contorno blanco en el tema oscuro.
- Herramienta «Ajustar a 8 caracteres…»: sustituye los dibujos sobrantes por
  el más parecido, una letra de la ROM elegida o un espacio, con vista previa
  y como una sola edición deshacible.

- Aviso antes de sobrescribir en escritorio un archivo de un formato anterior
  (v1 o v2), con la opción de guardar una copia; un proyecto migrado desde v2
  queda marcado como pendiente de guardar.
- Licencia MIT a nombre de Johann Pérez, con los avisos de terceros
  conservados; metadatos de autor y repositorio
  (https://github.com/Joyanzzz/lcd-studio).
- Documentación en inglés (`README.md`) y español (`README.es.md`), tabla de
  soporte por exportador, procedimientos de prueba física para HD44780,
  SSD1306 y MAX7219, despliegue en `lcd.joyanz.site` y procedimiento de
  publicación (`docs/release.md`).

### Cambiado
- Formato de proyecto v3 (bloque `device`); los v2 y v1 se abren y migran.
  Un archivo v3 no se abre con la versión 1.0.0.
- Las cruces rojas sobre las celdas se sustituyen por atenuación y bordes.
- «Páginas verticales» pasa al grupo de datos; el alcance de fotogramas de
  cada exportador lo fija el paso «Contenido» del asistente.
- El exportador XC8 usa el bus de la conexión configurada; el boceto SSD1306
  solo se ofrece con conexión I²C o sin conexión definida.

### Corregido
- Zod sondeaba `new Function` al cargar y la CSP (sin `unsafe-eval`) lo
  bloqueaba; Firefox lo mostraba como error de consola. Zod se usa ahora en
  modo `jitless` desde `src/core/zod.ts`, y la prueba de carga detecta
  cualquier infracción de la CSP en todos los navegadores.
- La prueba del aviso del límite dependía del tiempo real en WebKit
  (fallaba de forma intermitente); el plazo exacto de 5 s sigue cubierto por
  pruebas unitarias.

### Seguridad
- `npm run tauri:build` elimina del ejecutable las rutas locales de quien
  compila (carpeta personal y del repositorio) con `--remap-path-prefix`.
- El workflow de publicación limita el permiso de escritura al único job que
  lo necesita y comprueba que la etiqueta coincide con la versión.

### Eliminado
- Pestañas Exportar y Proyecto del panel lateral (sustituidas por menús y
  ventanas), barra de botones Nuevo/Abrir/Guardar (en el menú Archivo) y la
  navegación por secciones excluyentes en móvil.

## [1.0.0] - 2026-10-13 (interna, no publicada)

Reconstrucción completa a partir del prototipo de un solo archivo. Esta
versión no se distribuyó; sus proyectos (formato v2) se abren y migran.

### Añadido
- Editor de píxeles: lápiz, borrador, línea, rectángulo, elipse (contorno o
  relleno), relleno por área, texto 5×7, selección con mover/copiar/cortar/
  pegar, simetría, invertir, limpiar, voltear y desplazar; edición con teclado.
- Animación: fotogramas con duración propia (20–60 000 ms), reproducción en
  bucle, ida y vuelta o una vez, duplicar, borrar, reordenar (teclado y
  arrastre) y papel cebolla.
- Perfiles HD44780 16×2, 20×2, 16×4 y 20×4 con mapa DDRAM explícito, y
  pantallas gráficas SSD1306, PCD8544, KS0108 y personalizada (1–512 px).
- Análisis CGRAM que bloquea la exportación y lista las celdas incompatibles.
- Importación de PNG, JPEG, WebP y GIF animado en un worker, con encuadre,
  niveles, gamma, brillo, contraste, umbral e inversión, y tramados
  Floyd–Steinberg, Atkinson, Sierra Lite y Bayer 4×4/8×8.
- Exportadores: Adafruit_GFX, U8g2/XBM, páginas verticales, Arduino
  LiquidCrystal, LiquidCrystal_I2C, caracteres 5×8, binario, ASCII, PNG, hoja
  de sprites y GIF; PIC XC8 como experimental.
- Formato `.lcdstudio.json` v2 con validación estricta y migración desde v1.
- Autoguardado en IndexedDB con copia anterior y recuperación.
- Interfaz estilo Windows 2000 clara y oscura, accesible, desde 360 px.
- Español e inglés, con detección del idioma del sistema en el primer inicio.
- PWA instalable que funciona sin conexión.
- Aplicación de escritorio para Windows (Tauri 2) con diálogos nativos y
  escritura atómica.

### Eliminado (respecto al prototipo)
- LCD de caracteres sin mapa DDRAM verificado (16×1, 8×2, 24×2, 40×2 y
  personalizadas) y coincidencia ROM sin verificar por omisión.
- Tramado «Ruido» y literales binarios `Bxxxxxxxx`.
