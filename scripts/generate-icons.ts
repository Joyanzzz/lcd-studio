/**
 * Genera los iconos de la aplicación (PWA y escritorio) a partir de un diseño
 * pixel-art de 32×32, con el codificador PNG del propio proyecto.
 *
 *   node scripts/generate-icons.ts
 *
 * Después, para Windows: `npx tauri icon src-tauri/icons/app-icon-1024.png`,
 * conservando solo los iconos que enumera `src-tauri/tauri.conf.json` y
 * `icon.png` (los de macOS, móviles y Microsoft Store no se usan).
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { encodeIndexedPng, type Rgb } from '../src/exporters/encoders/png.ts';
import { glyphRows } from '../src/engine/text.ts';

const PALETTE: Rgb[] = [
  [0xd4, 0xd0, 0xc8], // 0 cara de ventana
  [0xff, 0xff, 0xff], // 1 luz
  [0x40, 0x40, 0x40], // 2 sombra oscura
  [0x80, 0x80, 0x80], // 3 sombra
  [0x1e, 0x2a, 0x12], // 4 marco LCD
  [0xb6, 0xcf, 0x5a], // 5 cristal
  [0x18, 0x22, 0x0c], // 6 píxel encendido
  [0x0a, 0x24, 0x6a], // 7 azul de título
];

const N = 32;

function design(): Uint8Array {
  const px = new Uint8Array(N * N);
  const set = (x: number, y: number, c: number) => {
    if (x >= 0 && y >= 0 && x < N && y < N) px[y * N + x] = c;
  };
  // Ventana con relieve 3D.
  for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) set(x, y, 0);
  for (let i = 0; i < N; i++) {
    set(i, 0, 1);
    set(0, i, 1);
    set(i, N - 1, 2);
    set(N - 1, i, 2);
    set(i, N - 2, 3);
    set(N - 2, i, 3);
  }
  // Barra de título.
  for (let y = 2; y <= 6; y++) for (let x = 2; x <= N - 3; x++) set(x, y, 7);
  // Módulo LCD.
  for (let y = 9; y <= 28; y++) for (let x = 3; x <= 28; x++) set(x, y, 4);
  for (let y = 11; y <= 26; y++) for (let x = 5; x <= 26; x++) set(x, y, 5);
  // Texto "LCD" con la fuente 5×7 en la primera fila y una barra en la segunda.
  let cx = 7;
  for (const ch of 'LCD') {
    const rows = glyphRows(ch.charCodeAt(0))!;
    rows.forEach((bits, r) => {
      for (let c = 0; c < 5; c++) if (bits & (0x10 >> c)) set(cx + c, 12 + r, 6);
    });
    cx += 6;
  }
  for (let x = 7; x <= 24; x += 2) for (let y = 21; y <= 24; y++) set(x, y, 6);
  return px;
}

function scaled(src: Uint8Array, size: number, inset = 0): Uint8Array {
  const out = new Uint8Array(size * size);
  const inner = size - 2 * inset;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x - inset;
      const v = y - inset;
      if (u < 0 || v < 0 || u >= inner || v >= inner) {
        out[y * size + x] = 7;
        continue;
      }
      out[y * size + x] = src[Math.floor((v * N) / inner) * N + Math.floor((u * N) / inner)]!;
    }
  }
  return out;
}

const art = design();
mkdirSync('public/icons', { recursive: true });
mkdirSync('src-tauri/icons', { recursive: true });
for (const size of [32, 180, 192, 512]) {
  writeFileSync(
    `public/icons/icon-${size}.png`,
    encodeIndexedPng(size, size, scaled(art, size), PALETTE),
  );
}
// Icono enmascarable: zona segura del 80 % centrada sobre fondo azul.
writeFileSync(
  'public/icons/icon-maskable-512.png',
  encodeIndexedPng(512, 512, scaled(art, 512, 52), PALETTE),
);
writeFileSync(
  'src-tauri/icons/app-icon-1024.png',
  encodeIndexedPng(1024, 1024, scaled(art, 1024), PALETTE),
);
console.log('Iconos generados.');
