/**
 * Genera `public/THIRD_PARTY_NOTICES.txt`, que se distribuye dentro de `dist/`
 * (web, PWA y aplicación de escritorio) con los avisos de licencia de las
 * dependencias incluidas: paquetes npm de producción y crates de Rust
 * enlazados en el ejecutable de Windows.
 *
 *   node scripts/third-party-notices.ts          (regenera el archivo)
 *   node scripts/third-party-notices.ts --check  (falla si está desactualizado)
 *
 * Requiere `npm ci` y `cargo` (para leer las fuentes de los crates).
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const OUTPUT = 'public/THIRD_PARTY_NOTICES.txt';
const RUST_TARGET = 'x86_64-pc-windows-msvc';
const LICENSE_FILE = /^(licen[cs]e|copying|notice|unlicense)([-._].*)?$/i;

interface Component {
  readonly ecosystem: 'npm' | 'crates.io';
  readonly name: string;
  readonly version: string;
  readonly license: string;
  readonly repository: string;
  readonly texts: readonly string[];
}

function licenseTexts(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => LICENSE_FILE.test(f))
    .sort()
    .map((f) => readFileSync(join(dir, f), 'utf8').replace(/\r\n/g, '\n').trim());
}

/** Aviso de licencia en la cabecera del archivo principal (p. ej. omggif). */
function headerNotice(path: string, main: string | undefined): string[] {
  const file = join(path, main ?? 'index.js');
  if (!existsSync(file)) return [];
  const header: string[] = [];
  for (const line of readFileSync(file, 'utf8').replace(/\r\n/g, '\n').split('\n')) {
    if (!line.startsWith('//')) break;
    header.push(line.replace(/^\/\/ ?/, ''));
  }
  const text = header.join('\n').trim();
  return /permission is hereby granted|licen[cs]e/i.test(text) ? [text] : [];
}

function npmComponents(): Component[] {
  const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
    packages: Record<string, { version?: string; license?: string; dev?: boolean }>;
  };
  const out: Component[] = [];
  for (const [path, pkg] of Object.entries(lock.packages)) {
    if (!path.startsWith('node_modules/') || pkg.dev) continue;
    const manifest = JSON.parse(readFileSync(join(path, 'package.json'), 'utf8')) as {
      repository?: string | { url?: string };
      main?: string;
    };
    const repo =
      typeof manifest.repository === 'string' ? manifest.repository : manifest.repository?.url;
    const files = licenseTexts(path);
    out.push({
      ecosystem: 'npm',
      name: path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length),
      version: pkg.version ?? '?',
      license: pkg.license ?? 'desconocida',
      repository: repo ?? '',
      texts: files.length > 0 ? files : headerNotice(path, manifest.main),
    });
  }
  return out;
}

interface CargoMetadata {
  packages: {
    id: string;
    name: string;
    version: string;
    license: string | null;
    repository: string | null;
    manifest_path: string;
  }[];
  resolve: {
    root: string;
    nodes: { id: string; deps: { pkg: string; dep_kinds: { kind: string | null }[] }[] }[];
  };
}

function rustComponents(): Component[] {
  const raw = execFileSync(
    'cargo',
    ['metadata', '--format-version', '1', '--locked', '--filter-platform', RUST_TARGET],
    { cwd: 'src-tauri', encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 },
  );
  const meta = JSON.parse(raw) as CargoMetadata;
  const nodes = new Map(meta.resolve.nodes.map((n) => [n.id, n]));
  // Solo dependencias normales: las de compilación y de pruebas no se distribuyen.
  const linked = new Set<string>();
  const queue = [meta.resolve.root];
  while (queue.length > 0) {
    for (const dep of nodes.get(queue.pop()!)?.deps ?? []) {
      if (!dep.dep_kinds.some((k) => k.kind === null) || linked.has(dep.pkg)) continue;
      linked.add(dep.pkg);
      queue.push(dep.pkg);
    }
  }
  return meta.packages
    .filter((p) => linked.has(p.id))
    .map((p) => ({
      ecosystem: 'crates.io' as const,
      name: p.name,
      version: p.version,
      license: p.license ?? 'desconocida',
      repository: p.repository ?? '',
      texts: licenseTexts(dirname(p.manifest_path)),
    }));
}

function render(input: readonly Component[]): string {
  const sorted = [...input].sort(
    (a, b) =>
      a.ecosystem.localeCompare(b.ecosystem) ||
      a.name.localeCompare(b.name) ||
      a.version.localeCompare(b.version),
  );
  // Un paquete sin archivo de licencia usa el texto de otro con la misma licencia.
  const byLicense = new Map<string, readonly string[]>();
  for (const c of sorted) {
    if (c.texts.length > 0 && !byLicense.has(c.license)) byLicense.set(c.license, c.texts);
  }
  const components = sorted.map((c) =>
    c.texts.length > 0 ? c : { ...c, texts: byLicense.get(c.license) ?? [] },
  );
  // Los textos idénticos (p. ej. Apache-2.0) se escriben una sola vez.
  const textIds = new Map<string, number>();
  for (const c of components) {
    for (const t of c.texts) if (!textIds.has(t)) textIds.set(t, textIds.size + 1);
  }
  const lines = [
    'LCD Studio — avisos de licencia de terceros',
    '',
    'LCD Studio incluye los siguientes componentes de terceros. Cada uno se',
    'distribuye bajo su propia licencia, cuyo texto se reproduce más abajo.',
    'El código fuente de cada componente está disponible en el repositorio',
    'indicado y en npm o crates.io.',
    '',
    '== Componentes ==',
    '',
  ];
  for (const c of components) {
    const refs = c.texts.map((t) => `[${textIds.get(t)}]`).join(' ');
    lines.push(`${c.ecosystem} ${c.name} ${c.version}`);
    lines.push(`  Licencia: ${c.license}`);
    if (c.repository) lines.push(`  Origen: ${c.repository}`);
    lines.push(
      `  Texto: ${refs || 'el estándar de la licencia indicada (el paquete no incluye archivo)'}`,
    );
    lines.push('');
  }
  lines.push('== Textos de licencia ==', '');
  for (const [text, id] of textIds) lines.push(`----- [${id}] -----`, '', text, '');
  return `${lines.join('\n').trimEnd()}\n`;
}

const content = render([...npmComponents(), ...rustComponents()]);
if (process.argv.includes('--check')) {
  const current = existsSync(OUTPUT) ? readFileSync(OUTPUT, 'utf8') : '';
  if (current !== content) {
    console.error(`${OUTPUT} está desactualizado: ejecuta node scripts/third-party-notices.ts`);
    process.exit(1);
  }
  console.log(`${OUTPUT} está al día.`);
} else {
  writeFileSync(OUTPUT, content);
  console.log(`${OUTPUT}: ${Buffer.byteLength(content)} bytes`);
}
