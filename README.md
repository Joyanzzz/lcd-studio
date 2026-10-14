# LCD Studio

Editor de animaciones píxel a píxel para pantallas LCD de caracteres HD44780,
pantallas gráficas monocromas (SSD1306, PCD8544, KS0108 o de tamaño libre) y
matrices de LEDs 8×8 con MAX7219, con exportación a código Arduino, datos de
mapa de bits e imágenes.

Funciona por completo en tu dispositivo: sin cuentas, sin servidor de
aplicación, sin telemetría y sin recursos remotos. Se distribuye como
aplicación web estática, como PWA que funciona sin conexión y como aplicación
de escritorio para Windows 10/11 x64.

## Funciones

- **Editor**: lápiz, borrador, línea, rectángulo y elipse (contorno o relleno),
  relleno por área, texto 5×7, selección con mover/copiar/cortar/pegar,
  simetría, invertir, limpiar, voltear y desplazar, deshacer/rehacer. Todo es
  utilizable con teclado ([atajos](docs/keyboard-shortcuts.md)).
- **Animación**: hasta 240 fotogramas con duración propia (20–60 000 ms),
  reproducción en bucle, ida y vuelta o una vez, duplicar, borrar, reordenar
  y papel cebolla.
- **Pantallas**: HD44780 16×2, 20×2, 16×4 y 20×4 con mapa DDRAM explícito;
  pantallas gráficas de 1 a 512 px; matriz de LEDs 8×8 (MAX7219) con giro
  físico, cableado y brillo configurables y patrones de diagnóstico. En las
  LCD de caracteres el límite de 8 caracteres propios se aplica al editar:
  repetir un patrón es libre y una operación que crearía un noveno se
  rechaza entera con un único aviso ([perfiles](docs/device-profiles.md)).
- **Proyecto guiado**: asistente de nuevo proyecto (pantalla, conexión y
  plataforma, o solo diseño), conversión de pantalla con vista previa y
  configuración guardada en el proyecto.
- **Importación de imágenes** PNG, JPEG, WebP y GIF animado, con encuadre,
  niveles y tramado Floyd–Steinberg, Atkinson, Sierra Lite o Bayer.
- **Exportación** con asistente (fotograma, selección o animación):
  Adafruit_GFX, U8g2/XBM, páginas verticales, Arduino LiquidCrystal y
  LiquidCrystal_I2C, MAX7219, caracteres 5×8, binario, ASCII, PNG, hoja de
  sprites y GIF; PIC XC8 como experimental ([formatos](docs/export-formats.md)).
- **Proyectos** `.lcdstudio.json` versionados, con validación estricta y
  migración desde el formato anterior ([formato](docs/file-format.md)).
- **Autoguardado** local con copia anterior y recuperación.
- Interfaz estilo Windows 2000 con barra de menús, tema claro y oscuro,
  español e inglés; dibujo y animación en la misma vista, también en móvil
  vertical y horizontal (desde 360 px).

## Uso rápido

```bash
npm ci
npm run dev
```

Abre la dirección que muestra Vite. Para la aplicación de escritorio, consulta
[docs/desktop-build.md](docs/desktop-build.md).

## Scripts

| Script | Descripción |
| ------ | ----------- |
| `npm run dev` | Servidor de desarrollo. |
| `npm run build` | Compilación de producción en `dist/`. |
| `npm run preview` | Sirve `dist/` con las cabeceras de seguridad. |
| `npm run test` | Pruebas unitarias. |
| `npm run test:coverage` | Pruebas unitarias con cobertura (umbral 90 %). |
| `npm run test:e2e` | Pruebas end-to-end en Chromium, Firefox, WebKit y móvil, en español e inglés. |
| `npm run lint` | ESLint y Prettier. |
| `npm run typecheck` | Comprobación de tipos. |
| `npm run tauri:dev` | Aplicación de escritorio en modo desarrollo. |
| `npm run tauri:build` | Instalador de Windows. |
| `npm run arduino:check` | Compila los bocetos Arduino generados (requiere `ARDUINO_CLI`). |
| `npm run audit:deps` | Auditoría de dependencias y licencias. |
| `npm run notices` | Regenera `public/THIRD_PARTY_NOTICES.txt` (requiere `cargo`). |
| `npm run bench` / `npm run bench:browser` | Mediciones de rendimiento. |

## Documentación

- [Arquitectura](docs/architecture.md) y [decisiones](docs/decisions.md)
- [Formato de archivo](docs/file-format.md)
- [Perfiles de pantalla](docs/device-profiles.md)
- [Formatos de exportación](docs/export-formats.md)
- [Validación en hardware](docs/hardware-validation.md)
- [Pruebas](docs/testing.md) y [rendimiento](docs/performance.md)
- [Despliegue web](docs/web-deployment.md)
- [Compilación de escritorio](docs/desktop-build.md)
- [Revisión de seguridad](docs/security-review.md)
- [Privacidad](PRIVACY.md) · [Seguridad](SECURITY.md) ·
  [Contribuir](CONTRIBUTING.md) · [Cambios](CHANGELOG.md)

## Estado del hardware

El código generado se compila en CI para Arduino Uno, Nano y Mega, pero
**compilar no equivale a funcionar en una pantalla real**. Consulta
[docs/hardware-validation.md](docs/hardware-validation.md) para saber qué
combinaciones se han probado físicamente.

## Licencia

[MIT](LICENSE). Las dependencias conservan sus propias licencias. Sus avisos
se distribuyen con la aplicación en `THIRD_PARTY_NOTICES.txt` (paquetes npm
de producción y crates de Rust del ejecutable de escritorio), generado con
`npm run notices`; `npm run audit:deps` comprueba que todas las licencias
de npm son permisivas.
