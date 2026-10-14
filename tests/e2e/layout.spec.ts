import { expect, test } from './fixtures.ts';

test.describe('diseño', () => {
  test('a 360 px no hay desplazamiento horizontal y las secciones cambian por pestañas', async ({
    page,
    app,
    t,
  }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await app.open();
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(overflow).toBeLessThanOrEqual(0);
    const nav = page.getByRole('navigation', { name: t('mobile.nav') });
    await expect(nav).toBeVisible();
    await nav.getByRole('button', { name: t('mobile.timeline') }).click();
    await expect(page.getByTestId('frame-strip')).toBeVisible();
    await expect(page.getByTestId('tool-pencil')).toBeHidden();
    await nav.getByRole('button', { name: t('mobile.tools') }).click();
    await expect(page.getByTestId('tool-pencil')).toBeVisible();
    await nav.getByRole('button', { name: t('mobile.panels') }).click();
    await expect(page.getByTestId('tab-export')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('mobile.png'), fullPage: true });
  });

  test('en escritorio se ven herramientas, paneles y línea de tiempo a la vez', async ({
    page,
    app,
    t,
    isMobile,
  }) => {
    test.skip(isMobile, 'Solo escritorio');
    await page.setViewportSize({ width: 1280, height: 800 });
    await app.open();
    await expect(page.getByRole('navigation', { name: t('mobile.nav') })).toBeHidden();
    await expect(page.getByTestId('tool-pencil')).toBeVisible();
    await expect(page.getByTestId('tab-draw')).toBeVisible();
    await expect(page.getByTestId('frame-strip')).toBeVisible();
    await page.screenshot({ path: test.info().outputPath('desktop.png') });
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
