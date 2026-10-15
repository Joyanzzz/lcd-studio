# Compilar la aplicación de escritorio (Windows 10/11 x64)

La aplicación de escritorio es Tauri 2: el mismo `dist/` de la versión web
dentro de WebView2, más una pequeña parte en Rust (`src-tauri/`) para los
diálogos nativos y la escritura atómica de archivos.

## Requisitos

- Node.js ≥ 22.12 y npm.
- Rust estable (`rustup`). Dos opciones en Windows:
  - **MSVC** (recomendada, la que usa CI): Visual Studio Build Tools con
    «Desarrollo para el escritorio con C++» y el toolchain
    `x86_64-pc-windows-msvc`.
  - **GNU** (sin privilegios de administrador): `rustup` con host
    `x86_64-pc-windows-gnu`, más binutils y gcc de MinGW-w64 en el `PATH`
    (por ejemplo, los paquetes `mingw-w64-x86_64-binutils` y
    `mingw-w64-x86_64-gcc` de MSYS2): `dlltool` necesita `as.exe`, y
    `tauri-winres` usa `gcc` como preprocesador del archivo de recursos. Así
    se compilaron en local los instaladores de 1.0.0 y 1.1.0-beta.1.
- WebView2 Runtime (incluido en Windows 11 y en Windows 10 actualizado). El
  instalador usa el modo por omisión de Tauri (`downloadBootstrapper`): si
  falta, descarga el instalador de WebView2 de Microsoft, así que **en ese
  caso la instalación necesita conexión**. La aplicación instalada no usa la
  red. Para una instalación totalmente sin conexión habría que cambiar
  `bundle.windows.webviewInstallMode` (`offlineInstaller` añade unos 130 MB);
  no está configurado.

## Desarrollo

```bash
npm ci
npm run tauri:dev
```

## Instalador

```bash
npm run tauri:build
```

Genera `src-tauri/target/release/bundle/nsis/LCD Studio_<versión>_x64-setup.exe`.
`npm run tauri:build` ejecuta `scripts/tauri-build.ts`, que sustituye en el
ejecutable las rutas locales de quien compila (carpeta personal de Cargo y
ruta del repositorio) por prefijos neutros.

- Instalación **por usuario** (`installMode: currentUser`): no pide
  privilegios de administrador.
- La aplicación no abre ventana de consola (`windows_subsystem = "windows"`).
- Tauri descarga NSIS la primera vez que empaqueta.
- Junto al ejecutable se instalan `LICENSE.txt` y `THIRD_PARTY_NOTICES.txt`
  (`bundle.resources`); la ayuda de la aplicación indica dónde están.
- **Sin firma de código**: Windows SmartScreen puede mostrar «Windows protegió
  su PC» / editor desconocido hasta que el archivo gane reputación. Firmarlo
  requiere un certificado de firma de código (decisión y coste del
  publicador); no hay ninguno configurado.
- `npm run tauri:build` regenera `dist/` sin la CSP en `<meta>`; ejecuta
  `npm run build` después si vas a usar la versión web.

Para obtener la suma SHA-256 del instalador:

```powershell
Get-FileHash "src-tauri\target\release\bundle\nsis\*.exe" -Algorithm SHA256
```

El flujo `.github/workflows/release.yml` compila el instalador al publicar una
etiqueta `v*` y adjunta `SHA256SUMS.txt`.

## Comprobación manual del instalador

Hecha el 2026-10-14 con el candidato `LCD Studio_1.1.0-beta.1_x64-setup.exe`
en el equipo de desarrollo (Windows 11 IoT Enterprise LTSC 2024, WebView2
155 ya instalado). **No** es una máquina limpia: tenía instalada la 1.0.0.

| Comprobación | Resultado |
| ------------ | --------- |
| Instalación silenciosa (`/S`) por usuario, sin administrador | Correcta; actualiza la 1.0.0 en `%LOCALAPPDATA%\LCD Studio` |
| Versión en Programas y características y en el ejecutable | 1.1.0-beta.1 |
| Archivos instalados | `lcd-studio.exe`, `WebView2Loader.dll`, `LICENSE.txt`, `THIRD_PARTY_NOTICES.txt`, `uninstall.exe`; acceso directo en el menú Inicio |
| Arranque | Correcto; recupera el autoguardado que dejó la 1.0.0 |
| Guardar como (diálogo nativo) | Archivo v3 válido, 12 fotogramas y duraciones intactas |
| Proyecto nuevo (asistente) y Abrir (diálogo nativo) | Correctos |
| Exportar boceto Arduino (diálogo nativo) | Bytes idénticos a los del núcleo; compila para Uno |
| Abrir un v2 y pulsar Ctrl+S | Pide confirmación; Cancelar deja el archivo intacto (mismo SHA-256) |
| Cerrar con cambios | Pregunta si guardar |
| Red durante el uso | 0 conexiones TCP del proceso y de su WebView2 |
| Rutas personales en el ejecutable | Ninguna |
| Firma | Sin firmar (`NotSigned`) |

No comprobado: instalación en una máquina limpia, en Windows 10, sin
WebView2 (descarga del bootstrapper) o sin conexión; desinstalación;
SmartScreen con el archivo descargado de Internet.

Procedimiento para repetirla:

1. Instala el `.exe` (doble clic, o `/S` para modo silencioso) y abre LCD
   Studio desde el menú Inicio.
2. Ayuda → Ayuda y atajos de teclado: comprueba la versión y la nota de
   avisos legales; abre la carpeta de instalación y comprueba que están
   `LICENSE.txt` y `THIRD_PARTY_NOTICES.txt`.
3. Dibuja algo, Archivo → Guardar como, crea un proyecto nuevo y vuelve a
   abrir el guardado.
4. Exporta una imagen, un archivo de datos y un boceto; ábrelos o compílalos.
5. Desconecta la red y repite el paso 3.
6. Cierra con cambios sin guardar: debe preguntar.
7. Desinstala desde Configuración → Aplicaciones. Los datos de recuperación
   quedan en `%LOCALAPPDATA%\com.lcdstudio.desktop`.

## Seguridad del ejecutable

- `identifier`: `com.lcdstudio.desktop` (estable; no lo cambies o Windows lo
  tratará como otra aplicación y perderá los datos de recuperación).
- CSP en `src-tauri/tauri.conf.json`; la compilación para escritorio omite la
  CSP en `<meta>` del HTML para no bloquear el IPC de Tauri.
- Capacidades (`src-tauri/capabilities/default.json`): escuchar eventos,
  cambiar el título, cerrar la ventana y los cinco comandos propios. Sin
  plugins `shell`, `fs`, `http` ni `updater`; el plugin de diálogos solo se
  usa desde Rust (JavaScript no tiene permiso para abrir diálogos ni elegir
  rutas).
- Navegación limitada al origen de la aplicación (`on_navigation`).
- La aplicación no hace peticiones de red.
- Recuperación ante cierre inesperado: igual que en web, IndexedDB del
  WebView2, guardada en la carpeta de datos privada de la aplicación
  (`%LOCALAPPDATA%\com.lcdstudio.desktop`).

## Archivos

- **Abrir**: diálogo nativo filtrado a `.json`; máximo 20 MiB. El archivo solo
  pasa a ser el «archivo actual» si la interfaz confirma que es un proyecto
  válido.
- **Guardar**: si hay archivo actual, se reescribe; si no, «Guardar como».
- **Guardar como / exportar**: diálogo nativo; Windows pide confirmación antes
  de sobrescribir.
- La escritura crea un temporal oculto en la misma carpeta, lo sincroniza con
  el disco y lo renombra sobre el destino.

## Añadir actualizaciones en el futuro

La primera versión no incluye actualizador automático. Para añadirlo de forma
segura:

1. Generar un par de claves con `npx tauri signer generate` y guardar la clave
   privada solo en los secretos de CI.
2. Añadir `tauri-plugin-updater` y su permiso (`updater:default`) a una
   capacidad separada.
3. Publicar un `latest.json` firmado en un servidor HTTPS propio.
4. **Preguntar siempre al usuario** antes de descargar o instalar una versión,
   y mostrar las notas de la versión; nunca actualizar en segundo plano.
5. Documentar en `PRIVACY.md` que la comprobación de actualizaciones contacta
   con ese servidor y permitir desactivarla.
