/**
 * Comprueba que todas las dependencias de producción (las que se distribuyen
 * con la aplicación) tienen una licencia permisiva conocida.
 *
 *   node scripts/check-licenses.ts
 */
import { readFileSync } from 'node:fs';

const ALLOWED = new Set([
  'MIT',
  'ISC',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'Apache-2.0',
  '0BSD',
  'Apache-2.0 OR MIT',
  'MIT OR Apache-2.0',
]);

interface LockPackage {
  version?: string;
  license?: string;
  dev?: boolean;
  optional?: boolean;
}

const lock = JSON.parse(readFileSync('package-lock.json', 'utf8')) as {
  packages: Record<string, LockPackage>;
};
const problems: string[] = [];
const seen: string[] = [];
for (const [path, pkg] of Object.entries(lock.packages)) {
  if (!path.startsWith('node_modules/') || pkg.dev) continue;
  const name = path.slice(path.lastIndexOf('node_modules/') + 'node_modules/'.length);
  const license = pkg.license ?? 'DESCONOCIDA';
  seen.push(`${name}@${pkg.version ?? '?'} ${license}`);
  if (!ALLOWED.has(license)) problems.push(`${name}@${pkg.version ?? '?'}: ${license}`);
}
console.log(`Dependencias de producción (${seen.length}):\n  ${seen.sort().join('\n  ')}`);
if (problems.length > 0) {
  console.error(`\nLicencias no permitidas:\n  ${problems.join('\n  ')}`);
  process.exit(1);
}
console.log('\nTodas las licencias son permisivas.');
