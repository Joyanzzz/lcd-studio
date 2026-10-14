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
    se compiló el instalador de la versión 1.0.0 en local.
- WebView2 Runtime (incluido en Windows 11 y en Windows 10 actualizado; el
  instalador lo descarga de Microsoft solo si falta).

## Desarrollo

```bash
npm ci
npm run tauri:dev
```

## Instalador

```bash
npm run tauri:build
```

Genera `src-tauri/target/release/bundle/nsis/LCD Studio_1.0.0_x64-setup.exe`.

- Instalación **por usuario** (`installMode: currentUser`): no pide
  privilegios de administrador.
- La aplicación no abre ventana de consola (`windows_subsystem = "windows"`).
- Tauri descarga NSIS la primera vez que empaqueta.

Para obtener la suma SHA-256 del instalador:

```powershell
Get-FileHash "src-tauri\target\release\bundle\nsis\*.exe" -Algorithm SHA256
```

El flujo `.github/workflows/release.yml` compila el instalador al publicar una
etiqueta `v*` y adjunta `SHA256SUMS.txt`.

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
