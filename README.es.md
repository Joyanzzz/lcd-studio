[English](README.md) · **Español**

# LCD Studio

Editor de animaciones píxel a píxel para pantallas LCD de caracteres
HD44780, pantallas gráficas monocromas (SSD1306, PCD8544, KS0108 o de tamaño
libre) y matrices de LEDs 8×8 con MAX7219. Exporta código Arduino, datos de
mapa de bits e imágenes.

> **Beta (1.1.0-beta.1).** Todo lo que se describe aquí está implementado y
> cubierto por pruebas automáticas, pero **ninguna exportación se ha probado
> todavía en hardware real**. El código Arduino generado compila; eso no
> demuestra que una pantalla real muestre la imagen correcta. Consulta las
> [limitaciones](#limitaciones).

LCD Studio funciona por completo en tu dispositivo: sin cuentas, sin servidor
de aplicación, sin telemetría y sin recursos remotos. Se distribuye como
aplicación web estática, como PWA que funciona sin conexión y como aplicación
de escritorio para Windows 10/11 x64.

## Funciones

- **Editor**: lápiz, borrador, línea, rectángulo y elipse (contorno o
  relleno), relleno por área, texto 5×7, selección con mover/copiar/cortar/
  pegar, simetría, invertir, limpiar, voltear y desplazar, deshacer/rehacer.
  Todo se puede usar con teclado ([atajos](docs/keyboard-shortcuts.md)).
- **Animación**: hasta 240 fotogramas con duración propia (20–60 000 ms),
  reproducción en bucle, ida y vuelta o una vez, duplicar, borrar, reordenar
  y papel cebolla.
- **Pantallas**: HD44780 16×2, 20×2, 16×4 y 20×4 con mapa DDRAM explícito;
  pantallas gráficas de 1 a 512 px; matriz de LEDs 8×8 (MAX7219) con giro
  físico, cableado y brillo configurables y patrones de diagnóstico. En las
  LCD de caracteres el límite de 8 caracteres propios se aplica al editar:
  repetir un patrón es libre y una operación que crearía un noveno se
  rechaza entera con un único aviso.
- **Ajustar a 8 caracteres** (opcional, con pérdida): cuando un fotograma
  necesita más de 8 patrones propios, esta herramienta muestra una vista
  previa antes/después y cambia las celdas sobrantes por el patrón más
  parecido, un carácter del mapa ROM elegido o un espacio, como una sola
  edición deshacible. Las exportaciones nunca sustituyen nada por su cuenta.
- **Proyecto guiado**: asistente de nuevo proyecto (pantalla, conexión y
  plataforma, o solo diseño), conversión de pantalla con vista previa y
  configuración del dispositivo guardada en el proyecto.
- **Importación de imágenes** PNG, JPEG, WebP y GIF animado, con encuadre,
  niveles y tramado Floyd–Steinberg, Atkinson, Sierra Lite o Bayer.
- **Asistente de exportación** (fotograma, selección o animación):
  Adafruit_GFX, U8g2/XBM, páginas verticales, Arduino LiquidCrystal y
  LiquidCrystal_I2C, MAX7219, caracteres 5×8, binario, ASCII, PNG, hoja de
  sprites y GIF; PIC XC8 como **experimental**
  ([formatos](docs/export-formats.md)).
- **Proyectos**: archivos `.lcdstudio.json` versionados, con validación
  estricta y migración desde formatos anteriores
  ([formato](docs/file-format.md)). Guardar encima de un archivo de un formato
  anterior pide confirmación y ofrece guardar una copia.
- **Autoguardado** en el almacenamiento local del navegador, con copia
  anterior y recuperación.
- Interfaz estilo Windows 2000 con barra de menús, tema claro y oscuro,
  español e inglés; dibujo y animación a la vista a la vez, también en móvil
  vertical y horizontal (desde 360 px de ancho).

## Uso

- **Web / PWA**: prevista en `https://lcd.joyanz.site` (todavía sin
  desplegar). Tras la primera carga se puede instalar desde el navegador y
  sigue funcionando sin conexión.
- **Windows**: descarga `LCD.Studio_1.1.0-beta.1_x64-setup.exe` de la
  [página de versiones de GitHub](https://github.com/Joyanzzz/lcd-studio/releases) y
  comprueba su SHA-256 con `SHA256SUMS.txt`. El instalador **no está
  firmado**, así que Windows SmartScreen puede avisar de un editor
  desconocido. Se instala solo para el usuario actual y no necesita permisos
  de administrador. Si falta WebView2 (poco habitual en Windows 10
  actualizado y en Windows 11), el instalador lo descarga de Microsoft, de
  modo que en ese caso necesita conexión. La aplicación en sí funciona sin
  conexión.

Los proyectos se guardan con **Archivo → Guardar** como `.lcdstudio.json`.
Las exportaciones (imágenes, datos, código) son archivos aparte: exportar
nunca sustituye al proyecto.

## Desarrollo

Requisitos: Node.js ≥ 22.12 y npm. La compilación de escritorio necesita
además Rust (ver [docs/desktop-build.md](docs/desktop-build.md)).

```bash
npm ci
npm run dev
```

| Script | Descripción |
| ------ | ----------- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Compilación de producción en `dist/`. |
| `npm run preview` | Sirve `dist/` con las cabeceras de seguridad. |
| `npm run test` | Pruebas unitarias. |
| `npm run test:coverage` | Pruebas unitarias con cobertura (umbrales del 90 %). |
| `npm run test:e2e` | Pruebas end-to-end en Chromium, Firefox, WebKit y móvil, en español e inglés. |
| `npm run lint` | ESLint y Prettier. |
| `npm run typecheck` | Comprobación de tipos. |
| `npm run tauri:dev` | Aplicación de escritorio en modo desarrollo. |
| `npm run tauri:build` | Instalador de Windows. |
| `npm run arduino:check` | Compila los bocetos Arduino generados (requiere `ARDUINO_CLI`). |
| `npm run audit:deps` | Auditoría de dependencias y licencias. |
| `npm run notices` | Regenera `public/THIRD_PARTY_NOTICES.txt` (requiere `cargo`). |
| `npm run bench` / `npm run bench:browser` | Mediciones de rendimiento. |

`npm run tauri:build` vuelve a generar `dist/` sin la CSP en `<meta>` que
necesita la versión web (Tauri aplica la suya). Ejecuta de nuevo
`npm run build` antes de desplegar la web o de lanzar las pruebas end-to-end.

## Limitaciones

- **Hardware**: ninguna combinación se ha probado en una pantalla real. Lo
  implementado, compilado y probado físicamente se detalla por exportador en
  [docs/hardware-validation.md](docs/hardware-validation.md), junto con los
  procedimientos de prueba para HD44780, SSD1306 y MAX7219.
- **Estimaciones de memoria**: se comparan con el compilador solo en los
  casos medidos (enumerados en ese documento); no son una garantía para
  cualquier proyecto, placa o versión de biblioteca.
- **PIC XC8** es experimental: el código generado nunca se ha compilado con
  XC8. Solo aparece si se activan las funciones experimentales en las
  preferencias.
- **Mapa ROM A00** es experimental: se transcribió de la hoja de datos y no
  se ha comparado con un módulo real; los módulos con ROM A02 muestran otros
  caracteres.
- **Firefox**: las pruebas end-to-end pasan en GitHub Actions (Firefox sin
  interfaz en Linux); no se han ejecutado en un Firefox de escritorio en
  Windows.
- **Instalador de escritorio**: sin firmar; no hay actualizador automático.

## Informar de un problema

[Abre una incidencia](https://github.com/Joyanzzz/lcd-studio/issues/new/choose) con:

- la versión de LCD Studio (Ayuda → Ayuda y atajos de teclado…) y si usas la
  versión web o la de escritorio;
- la versión del navegador o de Windows;
- los pasos para reproducirlo y lo que esperabas;
- si ayuda, un `.lcdstudio.json` que reproduzca el problema, solo si te
  parece bien compartirlo.

No incluyas datos personales. Para vulnerabilidades de seguridad, sigue
[SECURITY.md](SECURITY.md) en lugar de abrir una incidencia pública.

## Documentación

- [Arquitectura](docs/architecture.md) y [decisiones](docs/decisions.md)
- [Formato de archivo](docs/file-format.md)
- [Perfiles de pantalla](docs/device-profiles.md)
- [Formatos de exportación](docs/export-formats.md)
- [Validación en hardware](docs/hardware-validation.md)
- [Pruebas](docs/testing.md) y [rendimiento](docs/performance.md)
- [Despliegue web](docs/web-deployment.md)
- [Compilación de escritorio](docs/desktop-build.md)
- [Procedimiento de publicación](docs/release.md)
- [Revisión de seguridad](docs/security-review.md)
- [Privacidad](PRIVACY.md) · [Seguridad](SECURITY.md) ·
  [Contribuir](CONTRIBUTING.md) · [Cambios](CHANGELOG.md)

## Licencia

[MIT](LICENSE) © 2026 Johann Pérez. Las dependencias conservan sus propias
licencias. Sus avisos se distribuyen con la aplicación en
`THIRD_PARTY_NOTICES.txt` (paquetes npm de producción y crates de Rust del
ejecutable de escritorio), generado con `npm run notices`;
`npm run audit:deps` comprueba que todas las licencias de npm son
permisivas.
