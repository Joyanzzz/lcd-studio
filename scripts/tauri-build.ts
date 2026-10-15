/**
 * `tauri build` sin rutas locales dentro del ejecutable.
 *
 * Rust guarda en el binario la ruta de origen de cada dependencia (mensajes de
 * error con archivo y línea), y esa ruta incluye la carpeta personal del
 * usuario que compila (`…\Users\<usuario>\.cargo\registry\…`). Aquí se
 * sustituye por prefijos neutros. Se usa `CARGO_ENCODED_RUSTFLAGS` porque las
 * rutas pueden contener espacios.
 *
 *   node scripts/tauri-build.ts [argumentos de tauri build]
 */
import { spawnSync } from 'node:child_process';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';

const cargoHome = process.env['CARGO_HOME'] ?? join(homedir(), '.cargo');
const flags = [
  ...(process.env['CARGO_ENCODED_RUSTFLAGS']?.split('\x1f').filter(Boolean) ??
    process.env['RUSTFLAGS']?.split(' ').filter(Boolean) ??
    []),
  `--remap-path-prefix=${cargoHome}=/cargo`,
  `--remap-path-prefix=${resolve('.')}=/lcd-studio`,
];

const result = spawnSync('npx', ['tauri', 'build', ...process.argv.slice(2)], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
  env: { ...process.env, CARGO_ENCODED_RUSTFLAGS: flags.join('\x1f') },
});
process.exit(result.status ?? 1);
