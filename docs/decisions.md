# Registro de decisiones

Decisiones importantes tomadas durante la reconstrucción, por fase.

## Fase 1 — Auditoría

- El prototipo se usa solo como referencia y queda fuera del repositorio.
  Matriz completa en `docs/prototype-audit.md`.
- Se elimina el tramado «Ruido» (no pedido, redundante con Bayer) y el
  binario `Bxxxxxxxx` (sustituido por `.bin`).

## Fase 2 — Especificación

- Límites en un único módulo (`src/core/limits.ts`) usado por interfaz,
  validadores, importadores y exportadores.
- Solo cuatro perfiles HD44780 con DDRAM documentada; las LCD de caracteres
  personalizadas se eliminan.
- La coincidencia ROM se desactiva por omisión. La tabla A00 se incluye como
  experimental hasta verificarla en hardware.
- Formato de proyecto v2 estricto: claves desconocidas rechazadas, base64
  canónica, bits de relleno a cero.

## Fase 3 — Arquitectura

- Repositorio en `lcd-studio/`, separado del prototipo.
- TypeScript 6.0 (typescript-eslint aún no admite TS 7), ESLint 10 con
  typescript-eslint y react-hooks. `eslint-plugin-jsx-a11y` no admite ESLint 10:
  la accesibilidad se verifica con axe-core en las pruebas E2E.
- Importaciones con extensión `.ts` para que los scripts de Node usen el
  código de `src/` sin compilación previa.
- Todas las dependencias con versión exacta y publicadas al menos dos semanas
  antes de fijarlas.

## Fase 4 — Núcleo

- Proyecto inmutable con arreglos compartidos entre estados del historial.
- Errores como códigos con parámetros; el texto lo pone la interfaz.

## Fase 5 — Persistencia

- IndexedDB con copia actual y anterior escritas en una transacción.
- `localStorage` solo para preferencias de la interfaz.
- El análisis y la serialización de proyectos van a un worker para que abrir
  512×512×100 no bloquee la interfaz.

## Fase 6 — Interfaz

- Estado propio con `useSyncExternalStore` (sin bibliotecas de estado).
- Iconos pixel-art como SVG generados en tiempo de módulo, decorativos
  (`aria-hidden`).
- Lienzo con modo de teclado (cursor de píxel) y región `aria-live`.
- Internacionalización (añadida en mitad del proyecto, sin conflictos): capa
  transversal es/en; el contenido exportado no depende del idioma.
- Ajuste a 8 caracteres (añadido tras la 1.0.0): para aprovechar todas las
  celdas en dibujo libre sin tocar los exportadores, el ajuste a la CGRAM es
  una herramienta de edición explícita con vista previa y deshacible, no una
  sustitución automática al exportar. Se descartó multiplexar ranuras dentro
  de un fotograma: el cristal líquido promedia y se ve borroso o parpadea.
  Algoritmo determinista: selección voraz de 8 centros entre los glifos
  existentes y refinamiento por mayoría de bits ponderada (máximo 16 pasadas);
  en empate se prefieren destinos que no gastan ranura (espacio, ROM elegida).

## Fase 7 — Imágenes

- **Decodificador GIF: `omggif` 1.0.10.** Alternativas evaluadas:
  `ImageDecoder` (no existe en Firefox ni Safari), `gifuct-js` (sin
  publicaciones desde 2021, 3,7 MB con dependencias), `modern-gif` (copia RGBA
  completa de todos los cuadros sin límite, sin recorte de cuadros fuera del
  lienzo y errores en la lectura de sub-bloques). `omggif` es pequeño (38 KB),
  sin dependencias y lo usa Jimp; se auditó su decodificador
  (`docs/security-review.md`) y se envolvió con validación de límites antes de
  reservar memoria. Como su LZW podría entrar en bucle con datos maliciosos,
  se ejecuta en un worker con límite de tiempo y cancelación por terminación.
- Remuestreo propio (media por áreas / bilineal) en lugar de `drawImage`, para
  que el resultado no dependa del navegador.
- Tramados con aritmética entera (divisores potencia de dos).

## Fase 8 — Exportadores

- Código generado sin `setCursor()`: se direcciona la DDRAM del perfil
  (LiquidCrystal_I2C 1.1.2 tiene offsets fijos incorrectos para 16×4).
- Bocetos limitados a AVR con `#error` explícito en otras arquitecturas.
- «Una vez» detiene el MCU en bajo consumo en lugar de un bucle vacío.
- Memoria estimada con huellas medidas en compilaciones reales.
- PNG/GIF con codificadores propios deterministas (`fflate` para zlib).
- Comentarios del código generado en un idioma fijo (español) para que la
  salida no dependa del idioma de la interfaz.
- PIC XC8 detrás de la bandera experimental: no se dispone de XC8.

## Fase 9 — PWA

- Service worker propio generado en la compilación (sin dependencias): caché
  con nombre derivado del contenido, red primero para el HTML (una versión
  rota no queda fija), caché primero para recursos con hash, aviso de nueva
  versión sin recarga automática.

## Fase 10 — Escritorio

- Rust abre los diálogos y escribe los archivos; JavaScript nunca maneja rutas.
- Sin plugin `fs` ni `shell`; permisos explícitos por comando.
- Instalador NSIS por usuario (sin privilegios de administrador).
- Toolchain Rust `x86_64-pc-windows-gnu` en el equipo de desarrollo (no había
  MSVC Build Tools ni permisos de administrador); CI usa el toolchain MSVC
  estándar de GitHub Actions.

## Entrega 2 — Consolidación del editor y matriz LED

- **Límite CGRAM en la lógica, no en la interfaz**: `validateTransition`
  valida el resultado completo en `EditorStore.commit`, por donde pasan todas
  las ediciones, importaciones y atajos. Rechazar es atómico (sin dibujo
  parcial, historial, marca de modificado ni autoguardado). Se descartó
  bloquear celdas en la interfaz: repetir un patrón existente debe seguir
  siendo posible en cualquier celda, así que la atenuación es solo
  orientativa.
- **Proyectos en reparación**: se abren completos; se aceptan ediciones que no
  aumentan los patrones. No se ajustan solos (eso sería eliminar contenido en
  silencio); el ajuste es una herramienta explícita.
- **Aviso único** en un controlador propio (`LimitNotice`) con temporizador
  centralizado y limpieza al cambiar de proyecto o desmontar; la región viva
  solo recibe texto al aparecer para no repetir anuncios.
- **Patrón compartido**: la elección «copia» o «todas las apariciones» se hace
  antes de dibujar y el lienzo muestra el resultado durante el gesto. Si una
  operación edita de forma distinta varias apariciones del mismo patrón, ese
  patrón se trata como copia (no hay un resultado único).
- **Menús y ventanas** en lugar de pestañas de Proyecto y Exportar: dibujo y
  animación no se separan en modos; el panel lateral solo tiene Dibujo e
  Imagen y se retrae (cajón en pantallas pequeñas) sin desmontarse.
- **Línea de tiempo**: no se fuerza a que quepan todos los fotogramas (la
  referencia visual lo pedía, la especificación prevalece): ajuste con mínimo
  legible de 36 px y desplazamiento. Miniaturas uniformes para no sugerir que
  la anchura es la duración.
- **Iconos**: se conservan los iconos pixel-art propios (estilo Paint, sin
  recursos ajenos); en tema oscuro se genera automáticamente una capa de
  contorno (bordes + trazos negros interiores) en blanco.
- **Formato v3** con `device`; v2 se migra sin pérdida. Las combinaciones
  válidas de conexión y destino viven en `capabilities.ts`; el bus de 4/8
  bits es una conexión del HD44780.
- **Exportación**: la selección se exporta como imagen o datos (no código);
  el ZIP es un contenedor. Las opciones se recuerdan solo al guardar.
- **MAX7219**: el giro describe el módulo montado y se aplica solo al
  exportar; el dibujo nunca se gira por él. Cuatro perfiles de cableado
  explícitos en vez de suponer el de un fabricante. Boceto sin bibliotecas
  (`shiftOut`) para no depender de LedControl/MD_MAX72xx y poder compilarlo en
  CI sin instalar nada. Patrones de diagnóstico como fotogramas normales.
- **Siete segmentos**: solo se deja `content: 'raster'` en los perfiles y la
  tabla de capacidades extensible; no se trata un display de segmentos como
  raster.
