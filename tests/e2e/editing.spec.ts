import { expect, test } from './fixtures.ts';

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

  test('marca y bloquea más de 8 caracteres propios', async ({ page, app, t }) => {
    await app.open();
    // 9 celdas con dibujos distintos en la primera fila.
    for (let c = 0; c < 9; c++) {
      await app.clickPixel(c * 5, 0);
      for (let k = 0; k <= c % 5; k++) if (k > 0) await app.clickPixel(c * 5 + k, 1);
      if (c >= 5) await app.clickPixel(c * 5, 2);
    }
    await expect(page.getByTestId('cgram-status')).toHaveClass(/error-text/);
    await app.panel('export');
    await page.getByTestId('export-format').selectOption('arduino-liquidcrystal');
    await expect(page.getByTestId('export-generate')).toBeDisabled();
    await expect(page.getByTestId('export-diagnostics')).toContainText(
      t('export.cell', { frame: 1, row: 1, col: 9 }),
    );
  });
});
