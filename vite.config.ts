import react from '@vitejs/plugin-react';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { defineConfig, type Plugin } from 'vite';

const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8')) as {
  version: string;
};

/**
 * Política de seguridad de contenido de la versión web. Solo recursos propios;
 * sin scripts ni estilos en línea; `blob:` para las vistas previas de
 * imágenes exportadas. `frame-ancestors` no tiene efecto en una etiqueta
 * <meta>: el servidor debe enviarla como cabecera (ver docs/web-deployment.md).
 */
export const WEB_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' blob:",
  "font-src 'self'",
  "connect-src 'self'",
  "worker-src 'self'",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/** Inserta la CSP en el HTML compilado (en desarrollo Vite necesita scripts en línea). */
function cspMeta(): Plugin {
  return {
    name: 'lcd-studio-csp',
    // En escritorio la CSP la aplica Tauri (src-tauri/tauri.conf.json), que añade
    // el origen de su IPC; una segunda CSP en <meta> lo bloquearía.
    apply: (_config, env) =>
      env.command === 'build' && process.env['TAURI_ENV_PLATFORM'] === undefined,
    transformIndexHtml: {
      order: 'post',
      handler: (html) =>
        html.replace(
          '<meta charset="utf-8" />',
          `<meta charset="utf-8" />\n    <meta http-equiv="Content-Security-Policy" content="${WEB_CSP}" />`,
        ),
    },
  };
}

/** Genera `sw.js` con la lista de recursos y un nombre de caché derivado de su contenido. */
function serviceWorker(): Plugin {
  return {
    name: 'lcd-studio-sw',
    apply: 'build',
    generateBundle(_options, bundle) {
      const publicAssets = [
        'manifest.webmanifest',
        'icons/icon-32.png',
        'icons/icon-180.png',
        'icons/icon-192.png',
        'icons/icon-512.png',
        'icons/icon-maskable-512.png',
        'THIRD_PARTY_NOTICES.txt',
      ];
      const files = Object.keys(bundle)
        .filter((name) => !name.endsWith('.map'))
        .sort();
      const hash = createHash('sha256');
      for (const name of files) {
        const item = bundle[name]!;
        hash.update(name);
        hash.update(
          item.type === 'chunk'
            ? item.code
            : typeof item.source === 'string'
              ? item.source
              : Buffer.from(item.source),
        );
      }
      for (const name of publicAssets)
        hash.update(readFileSync(new URL(`./public/${name}`, import.meta.url)));
      const cacheName = `lcd-studio-${pkg.version}-${hash.digest('hex').slice(0, 16)}`;
      const assets = ['./', ...files.map((f) => `./${f}`), ...publicAssets.map((f) => `./${f}`)];
      const template = readFileSync(new URL('./src/pwa/sw-template.js', import.meta.url), 'utf8');
      this.emitFile({
        type: 'asset',
        fileName: 'sw.js',
        source: template
          .replaceAll('__CACHE_NAME__', cacheName)
          .replaceAll('__ASSETS__', JSON.stringify(assets, null, 2)),
      });
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [react(), cspMeta(), serviceWorker()],
  define: {
    'import.meta.env.VITE_APP_VERSION': JSON.stringify(pkg.version),
  },
  worker: {
    format: 'es',
  },
  build: {
    target: 'es2022',
    sourcemap: false,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
    reportCompressedSize: true,
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  preview: {
    port: 4173,
    strictPort: true,
    headers: {
      'Content-Security-Policy': `${WEB_CSP}; frame-ancestors 'none'`,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Permissions-Policy':
        'camera=(), microphone=(), geolocation=(), usb=(), serial=(), bluetooth=()',
    },
  },
});
