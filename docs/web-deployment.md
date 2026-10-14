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
