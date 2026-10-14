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
