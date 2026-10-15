# Despliegue web

La versión web es un conjunto de archivos estáticos (`dist/`). El servidor
solo los entrega: no recibe proyectos ni imágenes, que permanecen en el
navegador de cada usuario (memoria e IndexedDB), aunque la aplicación se
descargue de un servidor.

## Compilar

```bash
npm ci
npm run build
```

Resultado en `dist/`: `index.html` (con CSP en `<meta>`), `assets/` (JS y CSS
con hash), `sw.js`, `manifest.webmanifest` e `icons/`. Las rutas son relativas
(`base: './'`), así que puede servirse desde cualquier subcarpeta.

Prueba local idéntica a producción (con las cabeceras de seguridad):

```bash
npm run preview
```

## Despliegue en `lcd.joyanz.site` (beta)

Estado: **sin desplegar**. El dominio lo servirá un equipo en casa del
publicador; faltan sus datos (sistema operativo, software que sirve la web o
hace de proxy, forma de desplegar archivos, HTTPS, DNS y acceso) para dar una
configuración concreta. Los ejemplos de
nginx y Caddy de abajo son orientativos; no se han probado contra ese
dominio.

Lo que exige la arquitectura real, sea cual sea el servidor:

- **Raíz del dominio**: `dist/` se sirve tal cual en
  `https://lcd.joyanz.site/`. Las rutas son relativas, así que también
  funcionaría en una subcarpeta.
- **HTTPS** obligatorio (el service worker no se registra sin él). Si el
  certificado o el dominio cambian, los usuarios conservan sus proyectos solo
  si el **origen** (esquema + dominio + puerto) es el mismo: el autoguardado
  vive en el IndexedDB de ese origen.
- **Una sola página**: no hay rutas de cliente; basta con servir
  `index.html` en `/`. Recargar en `/` debe devolver `index.html`.
- **Caché**: `index.html`, `/` y `sw.js` con `Cache-Control: no-cache`
  (si `sw.js` se cachea, los usuarios tardan en recibir versiones nuevas);
  `assets/*` con caché larga e inmutable. `manifest.webmanifest`, `icons/*`
  y `THIRD_PARTY_NOTICES.txt` sin caché larga (no llevan hash).
- **Tipos MIME**: `.js` → `text/javascript`, `.webmanifest` →
  `application/manifest+json`, `.txt` → `text/plain; charset=utf-8`.
- **Cabeceras**: las de la sección «Cabeceras». Si el servicio no permite
  cabeceras, la CSP de `<meta>` de `index.html` sigue aplicándose, pero se
  pierden `frame-ancestors` (incrustación en otros sitios), HSTS y las demás.
  Deja constancia de ello si ocurre.
- **Despliegue atómico**: sube primero `assets/` y después `index.html` y
  `sw.js`, o publica la carpeta completa de una vez. No borres los
  `assets/` de la versión anterior hasta que la nueva esté publicada: una
  pestaña abierta con la versión anterior puede necesitarlos (normalmente los
  sirve su caché, pero no conviene depender de ello).

Comprobación después de desplegar (en una ventana privada y luego en una
normal):

1. `https://lcd.joyanz.site/` carga sin errores en la consola y, en
   Herramientas de desarrollo → Red, todas las peticiones son al mismo
   dominio.
2. Las cabeceras de `/`, `/sw.js` y un archivo de `/assets/` coinciden con
   lo anterior (por ejemplo, `curl -sI https://lcd.joyanz.site/sw.js`).
3. Ayuda → Ayuda y atajos de teclado muestra la versión esperada.
4. Dibuja algo, recarga: el trabajo se recupera. Desconecta la red y recarga:
   la aplicación sigue funcionando.
5. Crea, guarda (descarga) y vuelve a abrir un proyecto; exporta un PNG y un
   boceto Arduino.

Volver a la versión anterior: vuelve a publicar la carpeta `dist/` anterior
completa (guarda una copia de cada versión publicada, o el
`lcd-studio-web-vX.zip` de la versión en GitHub). Su `sw.js` es distinto del
publicado, así que los navegadores lo tratan como una actualización: verán el
aviso «Nueva versión disponible» y la aplicación no recargará sola. Los
proyectos guardados en el navegador se conservan si ambas versiones usan el
mismo formato de proyecto (v3 en 1.1.0-beta.1); una versión anterior no abre
un formato más nuevo.

## Requisitos del servidor

- **HTTPS** (obligatorio para el service worker, salvo en `localhost`).
- Tipos MIME correctos: `.js` → `text/javascript`, `.webmanifest` →
  `application/manifest+json`, `.png` → `image/png`.
- `sw.js` e `index.html` **sin caché HTTP** (`Cache-Control: no-cache`);
  `assets/*` con caché larga e inmutable (los nombres llevan hash).
- Cabeceras de seguridad (abajo). `frame-ancestors` solo funciona como
  cabecera, no en `<meta>`.

### Cabeceras

```
Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), usb=(), serial=(), bluetooth=()
Strict-Transport-Security: max-age=31536000
Cross-Origin-Opener-Policy: same-origin
```

## Ejemplo: nginx con autenticación en el proxy

Para un servidor privado: la autenticación la hace el proxy (la aplicación no
tiene cuentas).

```nginx
server {
    listen 443 ssl http2;
    server_name lcd.ejemplo.internal;

    ssl_certificate     /etc/ssl/lcd/fullchain.pem;
    ssl_certificate_key /etc/ssl/lcd/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    # Autenticación básica en el proxy (o auth_request hacia tu SSO).
    auth_basic           "LCD Studio";
    auth_basic_user_file /etc/nginx/lcd-studio.htpasswd;

    root /srv/lcd-studio/dist;
    index index.html;

    add_header Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=(), usb=(), serial=(), bluetooth=()" always;
    add_header Strict-Transport-Security "max-age=31536000" always;
    add_header Cross-Origin-Opener-Policy "same-origin" always;

    types { application/manifest+json webmanifest; }

    location = /sw.js      { add_header Cache-Control "no-cache" always; try_files $uri =404; }
    location = /index.html { add_header Cache-Control "no-cache" always; }
    location /assets/      { add_header Cache-Control "public, max-age=31536000, immutable" always; }
    location /             { try_files $uri $uri/ /index.html; }

    # Solo archivos estáticos: no se aceptan envíos.
    if ($request_method !~ ^(GET|HEAD)$) { return 405; }
}

server {
    listen 80;
    server_name lcd.ejemplo.internal;
    return 301 https://$host$request_uri;
}
```

Nota: en nginx, un `add_header` dentro de un `location` sustituye a los del
`server`; si añades cabeceras en un `location`, repite allí las de seguridad o
usa un archivo `include`.

## Ejemplo: Caddy

```caddy
lcd.ejemplo.internal {
    root * /srv/lcd-studio/dist
    basic_auth {
        usuario $2a$14$hash_bcrypt_generado_con_caddy_hash-password
    }
    header {
        Content-Security-Policy "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' blob:; font-src 'self'; connect-src 'self'; worker-src 'self'; manifest-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'"
        X-Content-Type-Options nosniff
        Referrer-Policy no-referrer
        Permissions-Policy "camera=(), microphone=(), geolocation=(), usb=(), serial=(), bluetooth=()"
        Cross-Origin-Opener-Policy same-origin
    }
    @nocache path /sw.js /index.html /
    header @nocache Cache-Control no-cache
    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
    try_files {path} /index.html
    file_server
}
```

## Actualizaciones de la PWA

Cada compilación genera `sw.js` con un nombre de caché derivado del
contenido. Al publicar una versión nueva, los usuarios conectados la reciben
en segundo plano y ven el aviso «Nueva versión disponible»; la aplicación no
recarga sola y, antes de activarla, espera a que termine el autoguardado.

Si alguna vez hubiera que retirar el service worker por completo, publica un
`sw.js` que se desregistre:

```js
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', async () => {
  for (const key of await caches.keys()) await caches.delete(key);
  await self.registration.unregister();
});
```

## Privacidad del despliegue

El servidor ve las peticiones de archivos estáticos (como cualquier sitio
web) pero nunca recibe datos del usuario: la aplicación no hace peticiones de
red con contenido del proyecto, no usa analítica ni recursos de terceros. Las
pruebas E2E verifican que no hay peticiones a otros orígenes.
