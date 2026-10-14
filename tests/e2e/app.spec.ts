import AxeBuilder from '@axe-core/playwright';
import { expect, test } from './fixtures.ts';

test.describe('aplicación', () => {
  test('carga sin errores, con CSP y sin peticiones a terceros', async ({ page, app, t }) => {
    const external: string[] = [];
    const errors: string[] = [];
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (
        !['localhost', '127.0.0.1'].includes(url.hostname) &&
        !['blob:', 'data:'].includes(url.protocol)
      ) {
        external.push(r.url());
      }
    });
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });
    page.on('pageerror', (e) => errors.push(e.message));
    await app.open();
    await expect(page.locator('meta[http-equiv="Content-Security-Policy"]')).toHaveAttribute(
      'content',
      /script-src 'self'/,
    );
    await expect(page.getByTestId('statusbar')).toContainText('80 × 16');
    // Una carga limpia no tiene cambios ni pasos que deshacer.
    await expect(page.getByTestId('save-status')).toHaveText(t('save.status.idle'));
    await expect(page.getByRole('button', { name: t('toolbar.undo') })).toBeDisabled();
    await app.clickPixel(1, 1);
    await app.waitSaved();
    expect(external).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('detecta el idioma del sistema la primera vez y recuerda el elegido', async ({
    page,
    app,
    t,
    locale,
  }) => {
    await app.open();
    await expect(page.locator('html')).toHaveAttribute('lang', locale!.slice(0, 2));
    await expect(page.getByRole('button', { name: t('toolbar.open'), exact: true })).toBeVisible();
    const other = locale!.startsWith('en') ? 'es' : 'en';
    await page.locator('#language-select').selectOption(other);
    await expect(page.locator('html')).toHaveAttribute('lang', other);
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('lang', other);
    await expect(page.locator('#language-select')).toHaveValue(other);
  });

  test('cambia entre tema claro y oscuro', async ({ page, app }) => {
    await app.open();
    const html = page.locator('html');
    const before = await html.getAttribute('data-theme');
    const themeButton = page.getByTestId('theme-toggle');
    await themeButton.click();
    const after = await html.getAttribute('data-theme');
    expect(after).not.toBe(before);
    expect(['light', 'dark']).toContain(after);
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe(after === 'dark' ? 'rgb(52, 54, 59)' : 'rgb(212, 208, 200)');
  });

  for (const theme of ['light', 'dark'] as const) {
    test(`sin infracciones graves de accesibilidad (tema ${theme})`, async ({ page, app }) => {
      await page.emulateMedia({ colorScheme: theme });
      await app.open();
      await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
      const results = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21aa'])
        .analyze();
      const serious = results.violations.filter(
        (v) => v.impact === 'serious' || v.impact === 'critical',
      );
      expect(
        serious.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`),
      ).toEqual([]);
    });
  }

  test('la ayuda se abre y cierra con teclado y devuelve el foco', async ({ page, app, t }) => {
    await app.open();
    const help = page.getByRole('button', { name: t('toolbar.help') });
    await help.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByTestId('help-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: t('dialog.help.title') })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(help).toBeFocused();
  });
});
