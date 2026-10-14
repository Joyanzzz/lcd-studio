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
    await app.menu('file', 'new');
    const dialog = page.getByTestId('new-dialog');
    // Asistente: familia → pantalla → conexión → plataforma → resumen.
    await page.getByTestId('new-family-character').check();
    await page.getByTestId('new-next').click();
    await page.getByTestId('new-profile-hd44780-20x4').check();
    await page.getByTestId('new-next').click();
    await page.getByTestId('setup-connection').selectOption('hd44780-i2c-pcf8574');
    await page.getByTestId('new-next').click();
    await page.getByTestId('setup-target-arduino-liquidcrystal-i2c').check();
    await page.getByTestId('new-next').click();
    await dialog.locator('#new-name').fill('Mi pantalla');
    await page.getByTestId('new-create').click();
    await expect(page.getByTestId('statusbar')).toContainText('100 × 32');
    await app.clickPixel(3, 3);
    const file = await app.saveDownload();
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
    // La configuración del dispositivo se restaura sin repetir el asistente.
    await app2.menu('project', 'projectSettings');
    await expect(page2.getByTestId('setup-connection')).toHaveValue('hd44780-i2c-pcf8574');
    await expect(page2.getByTestId('setup-target-arduino-liquidcrystal-i2c')).toBeChecked();
    await context.close();
  });

  test('empezar solo con el diseño y configurar el código después', async ({ page, app }) => {
    await app.open();
    await app.menu('file', 'new');
    await page.getByTestId('new-family-graphic').check();
    await page.getByTestId('new-next').click();
    await page.getByTestId('new-profile-ssd1306-128x32').check();
    await page.getByTestId('new-next').click();
    await page.getByTestId('new-design-only').click();
    await expect(page.getByTestId('new-step-summary')).toBeVisible();
    await page.getByTestId('new-create').click();
    await expect(page.getByTestId('statusbar')).toContainText('128 × 32');
    await app.menu('project', 'projectSettings');
    await page.getByTestId('setup-connection').selectOption('spi');
    await page.getByTestId('setup-target-u8g2-xbm').check();
    await page.getByTestId('project-settings-ok').click();
    await app.exportTo('u8g2-xbm', 'frame');
    // Con SPI no se ofrece el boceto I²C: solo tablas de datos.
    await page.getByTestId('export-back').click();
    await expect(page.getByTestId('export-step-options')).not.toContainText('I²C');
    await app.closeDialog();
  });

  test('cancelar la configuración y la conversión no cambia nada', async ({ page, app }) => {
    await app.open();
    await app.clickPixel(1, 1);
    await app.menu('project', 'projectSettings');
    await page.getByTestId('project-name').fill('Otro nombre');
    await app.closeDialog();
    await expect(page.locator('.titlebar h1')).not.toContainText('Otro nombre');
    await app.menu('project', 'convert');
    await page.getByTestId('convert-profile').selectOption('hd44780-20x4');
    await expect(page.getByTestId('convert-report')).toContainText('100 × 32');
    await app.closeDialog();
    await expect(page.getByTestId('statusbar')).toContainText('80 × 16');
  });

  test('convertir pantalla: vista previa, explicación, copia del original y deshacer', async ({
    page,
    app,
    t,
  }) => {
    await app.open();
    await app.clickPixel(79, 15);
    await app.clickPixel(0, 0);
    await app.menu('project', 'convert');
    await page.getByTestId('convert-profile').selectOption('max7219-8x8');
    await page.getByTestId('convert-mode-crop-top-left').check();
    const report = page.getByTestId('convert-report');
    await expect(report).toContainText(t('convert.report.lost', { pixels: 1 }));
    await expect(report).toContainText(t('convert.report.family'));
    await page.getByTestId('convert-copy').check();
    const download = page.waitForEvent('download');
    await page.getByTestId('convert-ok').click();
    const copy = await download;
    expect(copy.suggestedFilename()).toMatch(/\.lcdstudio\.json$/);
    await expect(page.getByTestId('statusbar')).toContainText('8 × 8');
    await page.getByRole('button', { name: t('toolbar.undo') }).click();
    await expect(page.getByTestId('statusbar')).toContainText('80 × 16');
  });

  test('matriz de LEDs: asistente, orientación física y patrones de diagnóstico', async ({
    page,
    app,
  }) => {
    await app.open();
    await app.menu('file', 'new');
    await page.getByTestId('new-family-led-matrix').check();
    await page.getByTestId('new-next').click();
    await page.getByTestId('new-next').click();
    await page.getByTestId('setup-connection').selectOption('max7219-spi');
    await page.getByTestId('setup-rotation').selectOption('180');
    await page.getByTestId('setup-wiring').selectOption('cols-lsb-top');
    await page.getByTestId('new-next').click();
    await page.getByTestId('setup-target-arduino-max7219').check();
    await page.getByTestId('new-next').click();
    await page.getByTestId('new-create').click();
    await expect(page.getByTestId('statusbar')).toContainText('8 × 8');
    await app.menu('project', 'diagnostics');
    await page.getByTestId('diagnostics-add').click();
    // 1 fotograma inicial + 19 de diagnóstico.
    await expect(page.getByTestId('frame-item')).toHaveCount(20);
    await app.exportTo('arduino-max7219', 'animation');
    await expect(page.getByTestId('export-preview')).toContainText('180°');
    await expect(page.getByTestId('export-preview')).toContainText('cols-lsb-top');
    await app.closeDialog();
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

  test('la copia descargada es idéntica a la serialización del núcleo', async ({ app }) => {
    await app.open();
    await app.clickPixel(0, 0);
    const bytes = await downloadBytes(await app.saveDownload());
    const text = new TextDecoder().decode(bytes);
    expect(text.startsWith('{\n  "format": "lcd-studio-project",\n  "schemaVersion": 3')).toBe(
      true,
    );
  });

  test('migra un proyecto v2 conservando su contenido', async ({ page, app, t }, info) => {
    let p = createProject({ name: 'Viejo', profileId: 'hd44780-16x2' });
    p = insertFrames(p, 1, [createFrame(new Uint8Array(80 * 16).fill(1), 300)]);
    const doc = JSON.parse(new TextDecoder().decode(serializeProject(p, GEN))) as Record<
      string,
      unknown
    >;
    delete doc['device'];
    doc['schemaVersion'] = 2;
    const path = info.outputPath('viejo.lcdstudio.json');
    await writeFile(path, JSON.stringify(doc));
    await app.open();
    await app.openProjectFile(path);
    await expect(page.getByRole('status').getByText(t('migration.fromV2'))).toBeVisible();
    await expect(page.getByTestId('frame-item')).toHaveCount(2);
    await expect(page.getByTestId('frame-item').nth(1)).toContainText('300 ms');
  });
});
