/// <reference lib="dom" />
/**
 * Mediciones en el navegador (Chromium sin interfaz) contra la compilación de
 * producción: tareas largas (> 50 ms) y fotogramas por segundo al abrir,
 * reproducir y dibujar un proyecto de 512×512 con 100 fotogramas.
 * Los resultados se documentan en docs/performance.md.
 *
 *   npm run build && npm run preview   (en otra terminal)
 *   node scripts/measure-browser.ts
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium, type Page } from '@playwright/test';
import { serializeProject } from '../src/core/project-format.ts';
import { createFrame, createProject, insertFrames } from '../src/core/project.ts';

const URL = process.env['PREVIEW_URL'] ?? 'http://localhost:4173/';

function bigProject(): Uint8Array {
  let p = createProject({ name: 'Grande', profileId: 'graphic-custom', width: 512, height: 512 });
  const px = new Uint8Array(512 * 512);
  for (let i = 0; i < px.length; i += 3) px[i] = 1;
  p = insertFrames(
    p,
    1,
    Array.from({ length: 99 }, (_, k) =>
      createFrame(
        px.map((v, i) => (i % 97 === k ? 1 : v)),
        100,
      ),
    ),
  );
  return serializeProject(p, { name: 'LCD Studio', version: 'medición' });
}

declare global {
  interface Window {
    longTasks: number[];
  }
}

async function watchLongTasks(page: Page): Promise<void> {
  await page.evaluate(() => {
    window.longTasks = [];
    new PerformanceObserver((list) => {
      for (const e of list.getEntries()) window.longTasks.push(Math.round(e.duration));
    }).observe({ type: 'longtask' });
  });
}

async function takeLongTasks(page: Page): Promise<number[]> {
  return page.evaluate(() => window.longTasks.splice(0));
}

async function frameStats(page: Page, ms: number) {
  return page.evaluate(
    (ms) =>
      new Promise<{ fps: number; p95: number; max: number }>((resolve) => {
        const t: number[] = [];
        const step = (now: number) => {
          t.push(now);
          if (now - t[0]! < ms) requestAnimationFrame(step);
          else {
            const d = t.slice(1).map((x, i) => x - t[i]!);
            d.sort((a, b) => a - b);
            resolve({
              fps: Math.round(((t.length - 1) * 1000) / (t.at(-1)! - t[0]!)),
              p95: Math.round(d[Math.floor(d.length * 0.95)]! * 10) / 10,
              max: Math.round(d.at(-1)! * 10) / 10,
            });
          }
        };
        requestAnimationFrame(step);
      }),
    ms,
  );
}

const dir = mkdtempSync(join(tmpdir(), 'lcd-medicion-'));
const file = join(dir, 'grande.lcdstudio.json');
writeFileSync(file, bigProject());
const browser = await chromium.launch();
try {
  const page = await (await browser.newContext({ locale: 'es-ES' })).newPage();
  await page.goto(URL);
  await page.getByTestId('lcd-canvas').waitFor();
  await watchLongTasks(page);

  const chooser = page.waitForEvent('filechooser');
  await page.getByRole('button', { name: 'Abrir', exact: true }).click();
  await (await chooser).setFiles(file);
  await page.getByTestId('statusbar').filter({ hasText: '512 × 512' }).waitFor({ timeout: 30_000 });
  await page.waitForTimeout(3000);
  console.log('Abrir 512×512×100 — tareas largas (ms):', await takeLongTasks(page));

  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  const before = await page.getByTestId('statusbar').innerText();
  await page.keyboard.press('Space');
  const playing = await frameStats(page, 3000);
  const after = await page.getByTestId('statusbar').innerText();
  await page.keyboard.press('Space');
  if (before === after) throw new Error('La reproducción no avanzó');
  console.log('Reproducir — FPS:', playing, '— tareas largas (ms):', await takeLongTasks(page));

  const box = (await page.getByTestId('lcd-canvas').boundingBox())!;
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  const drawing = frameStats(page, 2000);
  for (let i = 0; i < 120; i++) {
    await page.mouse.move(box.x + 20 + (i % 60) * 4, box.y + 20 + i * 2);
  }
  const drawStats = await drawing;
  await page.mouse.up();
  await page.waitForTimeout(2000);
  console.log(
    'Dibujar y autoguardar — FPS:',
    drawStats,
    '— tareas largas (ms):',
    await takeLongTasks(page),
  );

  await page.keyboard.press('.');
  await page.keyboard.press('.');
  await page.waitForTimeout(500);
  console.log('Cambiar de fotograma — tareas largas (ms):', await takeLongTasks(page));
} finally {
  await browser.close();
  rmSync(dir, { recursive: true, force: true });
}
