import { writeFile } from 'node:fs/promises';
import { serializeProject } from '../../src/core/project-format.ts';
import {
  createFrame,
  createProject,
  insertFrames,
  replaceFramePixels,
} from '../../src/core/project.ts';
import { downloadBytes, expect, test } from './fixtures.ts';

test.describe('edición', () => {
  test('dibujar, deshacer y rehacer', async ({ page, app, t }) => {
    await app.open();
    await app.clickPixel(0, 0);
    await app.clickPixel(2, 0);
    let rows = await app.asciiRows();
    expect(rows[0]!.slice(0, 4)).toBe('#.#.');
    await page.getByRole('button', { name: t('toolbar.undo') }).click();
    rows = await app.asciiRows();
    expect(rows[0]!.slice(0, 4)).toBe('#...');
    await page.getByRole('button', { name: t('toolbar.redo') }).click();
    rows = await app.asciiRows();
    expect(rows[0]!.slice(0, 4)).toBe('#.#.');
    // Atajo de teclado.
    await page.locator('body').click({ position: { x: 1, y: 1 } });
    await page.keyboard.press('Control+z');
    rows = await app.asciiRows();
    expect(rows[0]!.slice(0, 4)).toBe('#...');
  });

  test('formas, relleno y borrador', async ({ app }) => {
    await app.open();
    await app.tool('rect');
    await app.dragPixels([0, 0], [4, 7]);
    await app.tool('fill');
    await app.clickPixel(2, 3);
    await app.tool('eraser');
    await app.clickPixel(2, 3);
    const rows = await app.asciiRows();
    expect(rows[0]!.slice(0, 5)).toBe('#####');
    expect(rows[3]!.slice(0, 5)).toBe('##.##');
  });

  test('fotogramas: crear, duplicar, reordenar y borrar', async ({ page, app }) => {
    await app.open();
    await app.clickPixel(0, 0);
    await app.showTimeline();
    await page.getByTestId('frame-duplicate').click();
    await page.getByTestId('frame-new').click();
    const items = page.getByTestId('frame-item');
    await expect(items).toHaveCount(3);
    await expect(items.nth(2)).toHaveAttribute('aria-selected', 'true');
    // Reordenar con teclado: el fotograma 3 (vacío) pasa a ser el 2.
    await items.nth(2).focus();
    await page.keyboard.press('Alt+ArrowLeft');
    await expect(items.nth(1)).toHaveAttribute('aria-selected', 'true');
    // Reordenar arrastrando: el primero al final.
    await items.nth(0).dragTo(items.nth(2), { targetPosition: { x: 40, y: 10 } });
    await expect(items).toHaveCount(3);
    await page.getByTestId('frame-delete').click();
    await expect(items).toHaveCount(2);
  });

  test('valida la duración de los fotogramas', async ({ page, app }) => {
    await app.open();
    await app.showTimeline();
    const duration = page.getByTestId('frame-duration');
    await duration.fill('5');
    await expect(duration).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByRole('alert').filter({ hasText: '5' }).first()).toBeVisible();
    await duration.fill('250');
    await duration.press('Enter');
    await expect(page.getByTestId('frame-item').first()).toContainText('250 ms');
  });

  test('edición solo con teclado sobre el lienzo', async ({ page, app }) => {
    await app.open();
    await app.canvas.focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Space');
    const rows = await app.asciiRows();
    expect(rows[1]!.slice(0, 4)).toBe('..#.');
  });

  test('límite de 8 patrones: repetir funciona, el noveno se rechaza con un único aviso', async ({
    page,
    app,
    t,
  }) => {
    await page.clock.install();
    await app.open();
    // 8 patrones distintos (un píxel en distinta posición en las celdas 0–7).
    for (let c = 0; c < 8; c++) await app.clickPixel(c * 5 + (c % 5), Math.floor(c / 5));
    await expect(page.getByTestId('cgram-status')).toContainText('8/8');
    const undo = page.getByRole('button', { name: t('toolbar.undo') });
    const before = await undo.getAttribute('title');
    const notice = page.getByTestId('limit-notice');
    // Noveno patrón: no se dibuja, un solo aviso, sin paso de deshacer.
    await app.clickPixel(8 * 5 + 3, 1);
    await app.clickPixel(9 * 5 + 2, 4);
    await app.dragPixels([60, 2], [63, 6]);
    await expect(notice).toHaveCount(1);
    await expect(notice).toContainText(t('limit.title'));
    expect(await undo.getAttribute('title')).toBe(before);
    await expect(page.getByTestId('cgram-status')).toContainText('8/8');
    // Sigue visible tras el último intento y se oculta pasados 5 s. El reloj
    // falso sigue avanzando en tiempo real mientras se comprueba lo anterior,
    // así que se deja margen; el plazo exacto lo cubre limit-notice.test.ts.
    await page.clock.runFor(3000);
    await expect(notice).toBeVisible();
    await page.clock.runFor(2500);
    await expect(notice).toBeHidden();
    // Escape lo cierra sin tocar el dibujo.
    await app.clickPixel(8 * 5 + 3, 1);
    await expect(notice).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(notice).toBeHidden();
    // Repetir un patrón existente con la paleta sí se permite.
    await app.panel('draw');
    await page.getByTestId('cgram-slot').nth(3).click();
    await app.closePanel();
    await expect(page.getByTestId('tool-pattern')).toHaveAttribute('aria-checked', 'true');
    await app.clickPixel(12 * 5 + 1, 9);
    await expect(notice).toBeHidden();
    await expect(page.getByTestId('cgram-status')).toContainText('8/8');
    const rows = await app.asciiRows();
    expect(rows[8]!.slice(60, 65)).toBe('...#.');
  });

  test('editar un patrón repetido: la copia necesita ranura; «todas sus apariciones» no', async ({
    page,
    app,
  }) => {
    await app.open();
    for (let c = 0; c < 8; c++) await app.clickPixel(c * 5 + (c % 5), Math.floor(c / 5));
    // La celda (1,0) repite el patrón de la celda (0,0).
    await app.clickPixel(0, 8);
    await expect(page.getByTestId('cgram-status')).toContainText('8/8');
    await app.clickPixel(4, 12);
    await expect(page.getByTestId('limit-notice')).toBeVisible();
    await app.panel('draw');
    await page.getByTestId('shared-global').check();
    await app.closePanel();
    await app.clickPixel(4, 12);
    const rows = await app.asciiRows();
    // El píxel nuevo aparece en las dos apariciones del patrón.
    expect(rows[4]![4]).toBe('#');
    expect(rows[12]![4]).toBe('#');
  });

  test('proyecto antiguo en reparación: se abre completo, se repara y se guarda', async ({
    page,
    app,
    t,
  }, info) => {
    let p = createProject({ name: 'Antiguo', profileId: 'hd44780-16x2' });
    const px = new Uint8Array(80 * 16);
    for (let c = 0; c < 10; c++) px[Math.floor(c / 5) * 80 + c * 5 + (c % 5)] = 1;
    p = replaceFramePixels(p, 0, px);
    const path = info.outputPath('antiguo.lcdstudio.json');
    await writeFile(path, serializeProject(p, { name: 'LCD Studio', version: 'e2e' }));
    await app.open();
    await app.openProjectFile(path);
    await expect(page.getByTestId('repair-banner')).toBeVisible();
    await expect(page.getByTestId('cgram-status')).toContainText('10/8');
    // El código está bloqueado; las imágenes avisan de que no certifican compatibilidad.
    await app.exportTo('arduino-liquidcrystal', 'frame');
    await expect(page.getByTestId('export-diagnostics')).toContainText(
      t('export.cell', { frame: 1, row: 1, col: 9 }),
    );
    await expect(page.getByTestId('export-save')).toBeDisabled();
    await app.closeDialog();
    await app.exportTo('png', 'frame');
    await expect(page.getByTestId('export-diagnostics')).toContainText(
      t('export.visualNotCertified', { frames: 1 }).slice(0, 20),
    );
    await expect(page.getByTestId('export-save')).toBeEnabled();
    await app.closeDialog();
    // Añadir un patrón nuevo se rechaza; borrar uno (reducir) se acepta.
    // Un píxel en (2, 2) de una celda vacía es un patrón nuevo.
    await app.clickPixel(12 * 5 + 2, 10);
    await expect(page.getByTestId('limit-notice')).toBeVisible();
    await app.tool('eraser');
    await app.clickPixel(0, 0);
    await app.clickPixel(5 + 1, 0);
    await expect(page.getByTestId('cgram-status')).toContainText('8/8');
    await expect(page.getByTestId('repair-banner')).toBeHidden();
    // Se guarda el proyecto reparado.
    const file = await app.saveDownload();
    const text = new TextDecoder().decode(await downloadBytes(file));
    expect(text).toContain('"schemaVersion": 3');
  });

  test('ajuste a 8 caracteres desde el estado de reparación, deshacible', async ({
    page,
    app,
    t,
  }, info) => {
    let p = createProject({ name: 'Ajuste', profileId: 'hd44780-16x2' });
    const px = new Uint8Array(80 * 16);
    for (let c = 0; c < 9; c++) px[Math.floor(c / 5) * 80 + c * 5 + (c % 5)] = 1;
    p = replaceFramePixels(p, 0, px);
    p = insertFrames(p, 1, [createFrame(px.slice(), 200)]);
    const path = info.outputPath('ajuste.lcdstudio.json');
    await writeFile(path, serializeProject(p, { name: 'LCD Studio', version: 'e2e' }));
    await app.open();
    await app.openProjectFile(path);
    await page
      .getByTestId('repair-banner')
      .getByRole('button', { name: t('draw.cgramFit') })
      .click();
    const dialog = page.getByTestId('cgram-fit-dialog');
    await expect(dialog).toBeVisible();
    // Advierte de la pérdida y muestra antes y después.
    await expect(dialog).toContainText(t('dialog.cgramFit.intro'));
    await expect(dialog.getByRole('img')).toHaveCount(2);
    // Cancelar no cambia nada.
    const undo = page.getByRole('button', { name: t('toolbar.undo') });
    const undoBefore = await undo.getAttribute('title');
    await dialog.getByRole('button', { name: t('dialog.cancel') }).click();
    await expect(dialog).toBeHidden();
    expect(await undo.getAttribute('title')).toBe(undoBefore);
    await expect(page.getByTestId('repair-banner')).toBeVisible();
    // Alcance explícito: los dos fotogramas, en una sola operación.
    await page
      .getByTestId('repair-banner')
      .getByRole('button', { name: t('draw.cgramFit') })
      .click();
    await page.getByTestId('cgram-fit-all').check();
    await expect(page.getByTestId('cgram-fit-summary')).toContainText(
      t('dialog.cgramFit.summary', { frames: 2, cells: 2, pixels: 2 }),
    );
    await page.getByTestId('cgram-fit-apply').click();
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('repair-banner')).toBeHidden();
    await app.exportTo('arduino-liquidcrystal', 'frame');
    await expect(page.getByTestId('export-save')).toBeEnabled();
    await app.closeDialog();
    await page.getByRole('button', { name: t('toolbar.undo') }).click();
    await expect(page.getByTestId('repair-banner')).toBeVisible();
  });
});
