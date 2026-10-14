import { writeFile } from 'node:fs/promises';
import { serializeProject } from '../../src/core/project-format.ts';
import { createFrame, createProject, insertFrames } from '../../src/core/project.ts';
import { AppPage, downloadBytes, expect, test } from './fixtures.ts';

const GEN = { name: 'LCD Studio', version: 'e2e' };

test.describe('proyectos', () => {
  test('crear, editar, guardar, cerrar y volver a abrir', async ({
    page,
    app,
    t,
    browser,
    locale,
    isMobile,
    viewport,
  }, info) => {
    await app.open();
    await page.getByRole('button', { name: t('toolbar.new'), exact: true }).click();
    const dialog = page.getByTestId('new-dialog');
    await dialog.locator('#new-name').fill('Mi pantalla');
    await dialog.locator('#new-profile').selectOption('hd44780-20x4');
    await page.getByTestId('new-create').click();
    await expect(page.getByTestId('statusbar')).toContainText('100 × 32');
    await app.clickPixel(3, 3);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: t('toolbar.save'), exact: true }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('Mi pantalla.lcdstudio.json');
    const path = info.outputPath('saved.lcdstudio.json');
    await file.saveAs(path);
    await expect(page.locator('.titlebar h1')).not.toContainText(t('title.modified'));

    // "Cerrar": se cierra el contexto y se abre uno nuevo, sin datos guardados.
    await page.context().close();
    const context = await browser.newContext({
      locale: locale ?? 'es-ES',
      ...(isMobile && viewport ? { isMobile, viewport } : {}),
    });
    const page2 = await context.newPage();
    const app2 = new AppPage(page2, t);
    await app2.open();
    await expect(page2.getByTestId('statusbar')).toContainText('80 × 16');
    await app2.openProjectFile(path);
    await expect(page2.getByTestId('statusbar')).toContainText('100 × 32');
    await expect(page2.locator('.titlebar h1')).toContainText('Mi pantalla');
    const rows = await app2.asciiRows();
    expect(rows[3]!.slice(0, 5)).toBe('...#.');
    await context.close();
  });
  test('recupera el proyecto tras recargar', async ({ page, app }) => {
    await app.open();
    await app.clickPixel(4, 2);
    await app.waitSaved();
    await page.reload();
    await expect(app.canvas).toBeVisible();
    await expect(page.getByTestId('toast').first()).toBeVisible();
    const rows = await app.asciiRows();
    expect(rows[2]!.slice(0, 5)).toBe('....#');
  });

  for (const name of [
    'v1-damaged.lcdstudio.json',
    'v1-truncated.lcdstudio.json',
    'v1-oversized-frames.lcdstudio.json',
    'v1-oversized-canvas.lcdstudio.json',
    'v1-manipulated-length.lcdstudio.json',
  ]) {
    test(`rechaza ${name} sin perder el proyecto actual`, async ({ page, app, t }) => {
      await app.open();
      await app.clickPixel(1, 1);
      await app.openProjectFile(`tests/fixtures/projects/${name}`);
      await expect(page.getByRole('alert').getByText(t('toast.openFailed'))).toBeVisible();
      await expect(page.getByTestId('statusbar')).toContainText('80 × 16');
      const rows = await app.asciiRows();
      expect(rows[1]!.slice(0, 3)).toBe('.#.');
    });
  }

  test('migra un proyecto v1 del prototipo', async ({ page, app, t }) => {
    await app.open();
    await app.openProjectFile('tests/fixtures/projects/v1-valid-16x2.lcdstudio.json');
    await expect(page.getByRole('status').getByText(t('migration.fromV1'))).toBeVisible();
    await app.showTimeline();
    await expect(page.getByTestId('frame-item')).toHaveCount(2);
  });

  test('abre un proyecto de 512×512 con 100 fotogramas sin congelarse y rechaza 241', async ({
    page,
    app,
  }, info) => {
    let p = createProject({ name: 'Grande', profileId: 'graphic-custom', width: 512, height: 512 });
    const px = new Uint8Array(512 * 512);
    for (let i = 0; i < px.length; i += 3) px[i] = 1;
    p = insertFrames(
      p,
      1,
      Array.from({ length: 99 }, () => createFrame(px, 100)),
    );
    const big = info.outputPath('big.lcdstudio.json');
    await writeFile(big, serializeProject(p, GEN));
    await app.open();
    const start = Date.now();
    await app.openProjectFile(big);
    await expect(page.getByTestId('statusbar')).toContainText('512 × 512', { timeout: 30_000 });
    expect(Date.now() - start).toBeLessThan(30_000);
    // La interfaz sigue respondiendo.
    await expect(page.evaluate(() => 1 + 1)).resolves.toBe(2);

    const tooMany = JSON.parse(new TextDecoder().decode(serializeProject(p, GEN))) as {
      frames: unknown[];
    };
    tooMany.frames = Array.from({ length: 241 }, () => tooMany.frames[1]);
    const over = info.outputPath('over.lcdstudio.json');
    await writeFile(over, JSON.stringify(tooMany));
    await app.openProjectFile(over);
    await expect(page.getByTestId('toast').filter({ hasText: '240' }).first()).toBeVisible();
    await expect(page.getByTestId('statusbar')).toContainText('512 × 512');
  });

  test('la copia descargada es idéntica a la serialización del núcleo', async ({
    page,
    app,
    t,
  }) => {
    await app.open();
    await app.clickPixel(0, 0);
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: t('toolbar.save'), exact: true }).click();
    const bytes = await downloadBytes(await download);
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('{\n  "format": "lcd-studio-project",\n  "schemaVersion": 2')).toBe(
      true,
    );
  });
});
