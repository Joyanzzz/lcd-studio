# Procedimiento de publicación

Pasos para publicar una versión (por ejemplo, la beta `1.1.0-beta.1`).
Repositorio: https://github.com/Joyanzzz/lcd-studio.

| Dato pendiente | Dónde se usa |
| -------------- | ------------ |
| Software, acceso y despliegue del servidor casero de `lcd.joyanz.site` | configuración de cabeceras, caché y despliegue ([despliegue web](web-deployment.md)) |

## 0. Versión

La versión se declara en cuatro sitios y deben coincidir:
`package.json` (y `package-lock.json`), `src-tauri/tauri.conf.json`,
`src-tauri/Cargo.toml` (y `Cargo.lock`), y la sección del `CHANGELOG.md`.
El workflow de publicación falla si la etiqueta `vX` no coincide con
`package.json`.

```bash
node -p "require('./package.json').version"
```

## 1. Revisar y confirmar los cambios

```bash
git status
git diff
npm ci
npm run lint
npm run typecheck
npm run test:coverage
npm run build
npm run test:e2e
```

`npm run test:e2e` incluye Firefox; si en tu equipo no arranca, ejecuta los
demás proyectos (`--project=chromium-es --project=chromium-en
--project=webkit-es --project=webkit-en --project=mobile-es
--project=mobile-en`) y deja Firefox para la CI.

Revisa que no se versionan archivos locales (`git status` no debe mostrar
archivos locales de trabajo, `.tools/`, `dist/`, `build/` ni resultados de
pruebas) y confirma con un mensaje convencional, sin líneas de coautoría:

```bash
git add -A
git commit -m "chore: preparar la beta 1.1.0-beta.1"
```

## 2. Subir el código

Crea el repositorio vacío en GitHub (sin README ni licencia generados) y:

```bash
git remote add origin https://github.com/Joyanzzz/lcd-studio.git
git push -u origin main
```

Después, en GitHub: activa «Private vulnerability reporting» (Settings →
Code security), que es la vía que indica `SECURITY.md`.

## 3. Esperar y verificar la CI

En la pestaña Actions, el workflow **CI** debe terminar en verde en todos sus
jobs: `checks`, `e2e` (chromium, firefox, webkit, mobile), `arduino` y
`rust`. Es la primera ejecución real de estos workflows: hasta ahora solo se
han revisado. Si falla algo, corrígelo con un commit nuevo (no reescribas el
historial publicado) y repite.

Comprueba en particular el resultado de **Firefox**, que nunca se ha
ejecutado en el equipo de desarrollo.

## 4. Crear la pre-release

```bash
git tag -a v1.1.0-beta.1 -m "LCD Studio 1.1.0-beta.1"
git push origin v1.1.0-beta.1
```

El workflow **Release** compila en Windows y crea un **borrador**
marcado como pre-release (por el guion de la etiqueta) con:

- `LCD Studio_1.1.0-beta.1_x64-setup.exe`;
- `lcd-studio-web-v1.1.0-beta.1.zip` (la carpeta `dist/` de la web);
- `SHA256SUMS.txt` con la suma de ambos.

Antes de publicar el borrador:

1. Descarga los tres archivos y comprueba las sumas:
   ```powershell
   Get-FileHash "LCD Studio_1.1.0-beta.1_x64-setup.exe" -Algorithm SHA256
   ```
2. Instala el `.exe` en un Windows de prueba y repite la comprobación manual
   de [desktop-build.md](desktop-build.md#comprobación-manual-del-instalador).
3. Copia en las notas la sección `[1.1.0-beta.1]` del `CHANGELOG.md` y las
   limitaciones de la beta.
4. Publica el borrador.

El instalador que se publica es **el que compila la CI** a partir de la
etiqueta. Los instaladores compilados en local sirven para revisar, no para
distribuir: NSIS no es reproducible byte a byte y su SHA-256 cambia en cada
compilación.

## 5. Desplegar la web

Usa el `lcd-studio-web-v1.1.0-beta.1.zip` de la versión (compilado con CSP
por la CI) o compila tú la etiqueta:

```bash
git checkout v1.1.0-beta.1
npm ci
npm run build
```

Sube el contenido de `dist/` a `lcd.joyanz.site` siguiendo
[web-deployment.md](web-deployment.md#despliegue-en-lcdjoyanzsite-beta) y
haz la comprobación posterior que se describe allí. Guarda una copia de la
carpeta publicada.

## 6. Si algo falla

- **Web**: vuelve a publicar la carpeta `dist/` anterior completa. Los
  navegadores la reciben como una actualización (aviso, sin recarga
  automática). Si no había versión anterior, retira el sitio o publica una
  página estática de mantenimiento; no publiques un `sw.js` vacío.
- **Pre-release**: si aún es borrador, bórralo; si ya es público, márcalo
  como borrador o elimina los archivos defectuosos y explica el motivo en las
  notas. No reutilices la etiqueta: publica `v1.1.0-beta.2`.
- **Código**: corrige con commits nuevos. No reescribas el historial ni
  muevas etiquetas ya publicadas.
