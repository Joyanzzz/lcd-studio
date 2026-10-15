import type { Page } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { serializeProject } from '../../src/core/project-format.ts';
import { createFrame, createProject, insertFrames } from '../../src/core/project.ts';
import { expect, test } from './fixtures.ts';

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test.describe('diseño', () => {
  test('en escritorio se ven herramientas, lienzo, panel y línea de tiempo a la vez', async ({
    page,
    app,
    isMobile,
  }) => {
    test.skip(isMobile, 'Solo escritorio');
    await page.setViewportSize({ width: 1280, height: 800 });
    await app.open();
    await expect(page.getByTestId('tool-pencil')).toBeVisible();
    await expect(page.getByTestId('tab-draw')).toBeVisible();
    await expect(page.getByTestId('tab-image')).toBeVisible();
    await expect(page.getByTestId('frame-strip')).toBeVisible();
    await expect(app.canvas).toBeVisible();
    await noHorizontalScroll(page);
    await page.screenshot({ path: test.info().outputPath('desktop.png') });
  });

  test('móvil vertical: lienzo y línea de tiempo visibles; panel como cajón y plegable', async ({
    page,
    app,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await app.open();
    await noHorizontalScroll(page);
    await expect(app.canvas).toBeVisible();
    await expect(page.getByTestId('tool-pencil')).toBeVisible();
    await expect(page.getByTestId('frame-strip')).toBeVisible();
    // El panel lateral empieza retraído y se despliega sobre el lienzo.
    await expect(page.getByTestId('side-panel')).toHaveAttribute('data-open', 'false');
    await app.panel('draw');
    await expect(page.getByTestId('tab-image')).toBeVisible();
    await expect(page.getByTestId('frame-strip')).toBeVisible();
    await app.closePanel();
    // La línea de tiempo se puede plegar para ganar espacio.
    await page.getByTestId('timeline-collapse').click();
    await expect(page.getByTestId('frame-strip')).toBeHidden();
    await expect(page.getByTestId('play')).toBeVisible();
    await app.showTimeline();
    await expect(page.getByTestId('frame-strip')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('mobile.png') });
  });

  test('móvil horizontal: dibujo y línea de tiempo visibles a la vez', async ({ page, app }) => {
    await page.setViewportSize({ width: 740, height: 360 });
    await app.open();
    await noHorizontalScroll(page);
    await expect(app.canvas).toBeVisible();
    await expect(page.getByTestId('frame-strip')).toBeVisible();
    await expect(page.getByTestId('tool-pencil')).toBeVisible();
    const strip = (await page.getByTestId('frame-strip').boundingBox())!;
    const wrap = (await page.locator('.canvas-wrap').boundingBox())!;
    expect(wrap.y + wrap.height).toBeLessThanOrEqual(strip.y + 1);
    expect(wrap.height).toBeGreaterThanOrEqual(60);
    expect(strip.y + strip.height).toBeLessThanOrEqual(360);
    await page.screenshot({ path: test.info().outputPath('landscape.png') });
  });

  test('cambiar de orientación conserva fotograma activo, selección, reproducción y dibujo', async ({
    page,
    app,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await app.open();
    await app.clickPixel(1, 1);
    await page.getByTestId('frame-duplicate').click();
    await page.getByTestId('frame-new').click();
    const items = page.getByTestId('frame-item');
    await expect(items).toHaveCount(3);
    await items.nth(1).click();
    await app.tool('select');
    await app.dragPixels([0, 0], [3, 3]);
    const status = page.getByTestId('statusbar');
    await expect(status).toContainText('4 × 4');
    await page.setViewportSize({ width: 740, height: 360 });
    await expect(items.nth(1)).toHaveAttribute('aria-selected', 'true');
    // Tras girar desde vertical, dibujo y animación siguen visibles a la vez.
    await expect(app.canvas).toBeVisible();
    await expect(page.getByTestId('frame-strip')).toBeVisible();
    const strip = (await page.getByTestId('frame-strip').boundingBox())!;
    const wrap = (await page.locator('.canvas-wrap').boundingBox())!;
    expect(wrap.y + wrap.height).toBeLessThanOrEqual(strip.y + 1);
    expect(wrap.height).toBeGreaterThanOrEqual(60);
    expect(strip.y + strip.height).toBeLessThanOrEqual(360);
    await page.setViewportSize({ width: 360, height: 740 });
    await expect(status).toContainText('4 × 4');
    await page.getByTestId('play').click();
    await expect(page.getByTestId('play')).toHaveAttribute('data-playing', 'true');
    await page.setViewportSize({ width: 740, height: 360 });
    await expect(page.getByTestId('play')).toHaveAttribute('data-playing', 'true');
    await page.getByTestId('play').click();
    await expect(page.getByTestId('play')).toHaveAttribute('data-playing', 'false');
    await expect(items).toHaveCount(3);
    await items.nth(0).click();
    const rows = await app.asciiRows();
    expect(rows[1]!.slice(0, 3)).toBe('.#.');
  });

  test('línea de tiempo con el máximo de fotogramas: mínimo legible, desplazamiento y selección visible', async ({
    page,
    app,
  }, info) => {
    test.setTimeout(90_000);
    let p = createProject({ name: 'Largo', profileId: 'hd44780-16x2' });
    p = insertFrames(
      p,
      1,
      Array.from({ length: 239 }, (_, i) => createFrame(new Uint8Array(80 * 16), 20 + i)),
    );
    const path = info.outputPath('largo.lcdstudio.json');
    await writeFile(path, serializeProject(p, { name: 'LCD Studio', version: 'e2e' }));
    await app.open();
    await app.openProjectFile(path);
    const items = page.getByTestId('frame-item');
    await expect(items).toHaveCount(240);
    const strip = page.getByTestId('frame-strip');
    expect(await strip.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    const box = (await items.first().locator('.thumb-box').boundingBox())!;
    expect(box.width).toBeGreaterThanOrEqual(30);
    // Número y duración se muestran por separado.
    await expect(items.nth(239)).toContainText('#240');
    await expect(items.nth(239)).toContainText('258 ms');
    await items.first().focus();
    await page.keyboard.press('End');
    await expect(items.nth(239)).toHaveAttribute('aria-selected', 'true');
    await expect(items.nth(239)).toBeInViewport();
    // Zoom de las miniaturas: la selección sigue a la vista.
    await page.getByTestId('timeline-zoom-in').click();
    await expect(page.getByTestId('timeline-fit')).toHaveAttribute('aria-pressed', 'false');
    await expect(items.nth(239)).toBeInViewport();
  });
});

test('funciona sin conexión después de la primera carga', async ({
  page,
  app,
  context,
  browserName,
}) => {
  test.skip(
    browserName !== 'chromium',
    'El modo sin conexión de Playwright con service workers se verifica en Chromium',
  );
  await app.open();
  await page
    .waitForFunction(() => navigator.serviceWorker?.controller !== null, undefined, {
      timeout: 20_000,
    })
    .catch(async () => {
      await page.reload();
      await page.waitForFunction(() => navigator.serviceWorker?.controller !== null);
    });
  await context.setOffline(true);
  await page.reload();
  await expect(app.canvas).toBeVisible();
  await app.clickPixel(0, 0);
  const rows = await app.asciiRows();
  expect(rows[0]![0]).toBe('#');
  await context.setOffline(false);
});
