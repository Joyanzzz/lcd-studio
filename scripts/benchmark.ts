/**
 * Mediciones de rendimiento de las operaciones del núcleo (Node, un hilo).
 * Los resultados se documentan en docs/performance.md.
 *
 *   node scripts/benchmark.ts
 */
import { performance } from 'node:perf_hooks';
import { parseProjectFile, serializeProject } from '../src/core/project-format.ts';
import { createFrame, createProject, insertFrames, type Project } from '../src/core/project.ts';
import { DrawSurface } from '../src/engine/draw.ts';
import { floodFill } from '../src/engine/fill.ts';
import { DEFAULT_IMAGE_PARAMS } from '../src/engine/image/params.ts';
import { ImagePipeline } from '../src/engine/image/pipeline.ts';
import { getProfile } from '../src/device-profiles/index.ts';
import { getExporter, runExport } from '../src/exporters/index.ts';

function measure(label: string, fn: () => unknown, runs = 5): void {
  fn();
  const times: number[] = [];
  for (let i = 0; i < runs; i++) {
    const t0 = performance.now();
    fn();
    times.push(performance.now() - t0);
  }
  times.sort((a, b) => a - b);
  const median = times[Math.floor(times.length / 2)]!;
  console.log(
    `${label.padEnd(58)} mediana ${median.toFixed(1).padStart(8)} ms   máx ${times.at(-1)!.toFixed(1).padStart(8)} ms`,
  );
}

function bigProject(frames: number): Project {
  let p = createProject({ name: 'bench', profileId: 'graphic-custom', width: 512, height: 512 });
  const px = new Uint8Array(512 * 512);
  for (let i = 0; i < px.length; i += 3) px[i] = 1;
  p = insertFrames(
    p,
    1,
    Array.from({ length: frames - 1 }, () => createFrame(px.slice(), 100)),
  );
  return p;
}

const gen = { name: 'LCD Studio', version: 'bench' };
const p100 = bigProject(100);
const bytes = serializeProject(p100, gen);
console.log(`Proyecto 512×512×100: ${(bytes.length / 1024 / 1024).toFixed(2)} MiB serializado\n`);

measure('Serializar 512×512×100 (worker de proyectos)', () => serializeProject(p100, gen), 3);
measure('Validar y abrir 512×512×100 (worker de proyectos)', () => parseProjectFile(bytes), 3);

const src = {
  width: 2048,
  height: 2048,
  luma: new Uint8Array(2048 * 2048),
  alpha: new Uint8Array(2048 * 2048).fill(255),
  durationMs: 100,
};
for (let i = 0; i < src.luma.length; i++) src.luma[i] = (i * 7) & 255;
const pipeline = new ImagePipeline(src);
measure(
  'Imagen 2048² → 512×512 Floyd–Steinberg (primera, con integral)',
  () => new ImagePipeline(src).render(512, 512, DEFAULT_IMAGE_PARAMS),
  3,
);
measure('Imagen 2048² → 512×512 ajuste de parámetros (caché)', () =>
  pipeline.render(512, 512, { ...DEFAULT_IMAGE_PARAMS, threshold: 100 }),
);
measure('Imagen 2048² → 128×64 Bayer 8×8', () =>
  pipeline.render(128, 64, { ...DEFAULT_IMAGE_PARAMS, dither: 'bayer8' }),
);

measure('Relleno por área 512×512 vacío', () =>
  floodFill(new Uint8Array(512 * 512), 512, 512, 10, 10, 1),
);
measure('Trazo de lápiz de 512 segmentos en 512×512', () => {
  const s = new DrawSurface(512, 512, new Uint8Array(512 * 512));
  for (let i = 0; i < 512; i++) s.line(i, 0, 511 - i, 511, 1);
});

const p10 = bigProject(10);
const ctx = (project: Project) => ({
  project,
  profile: getProfile(project.profileId)!,
  currentFrame: 0,
  appVersion: 'bench',
});
measure(
  'Exportar GIF 512×512×10 a escala 2',
  () => runExport(getExporter('gif')!, ctx(p10), { scale: 2 }),
  3,
);
measure(
  'Exportar hoja de sprites 512×512×10 a escala 1',
  () => runExport(getExporter('sprite-sheet')!, ctx(p10), { scale: 1 }),
  3,
);
measure(
  'Exportar páginas verticales 512×512×10 (Mega)',
  () => runExport(getExporter('binary')!, ctx(p10), {}),
  3,
);
const lcd = createProject({ name: 'lcd', profileId: 'hd44780-20x4' });
const lcd240 = insertFrames(
  lcd,
  1,
  Array.from({ length: 239 }, () =>
    createFrame(
      new Uint8Array(100 * 32).map((_, i) => (i % 7 === 0 ? 1 : 0)),
      100,
    ),
  ),
);
measure('Validar LiquidCrystal 20×4 × 240 fotogramas', () =>
  getExporter('arduino-liquidcrystal')!.validate(
    ctx(lcd240),
    getExporter('arduino-liquidcrystal')!.normalize({ board: 'arduino-mega2560' }, ctx(lcd240)),
  ),
);
