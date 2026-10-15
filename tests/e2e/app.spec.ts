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
    // Cualquier intento bloqueado por la CSP, aunque el código lo capture
    // (Firefox lo muestra en la consola; Chromium y WebKit, solo como evento).
    await page.addInitScript(() => {
      document.addEventListener('securitypolicyviolation', (e) => {
        console.error(`CSP: ${e.violatedDirective} ${e.blockedURI}`);
      });
    });
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
    await expect(page.getByRole('menuitem', { name: t('menu.file'), exact: true })).toBeVisible();
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

  test('menús con teclado: la ayuda se abre y Escape devuelve el foco al menú', async ({
    page,
    app,
    t,
  }) => {
    await app.open();
    const help = page.getByTestId('menu-help');
    await help.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('menu-help-list')).toBeVisible();
    await page.keyboard.press('Enter');
    const dialog = page.getByTestId('help-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: t('dialog.help.title') })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(help).toBeFocused();
    // Flechas entre menús y Escape para cerrar sin activar nada.
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByTestId('menu-export')).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByTestId('menu-export-list')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('menu-export-list')).toBeHidden();
    await expect(page.locator('dialog[open]')).toHaveCount(0);
  });
});

test('la ayuda enlaza los avisos de licencia de terceros, servidos con la aplicación', async ({
  page,
  app,
  t,
}) => {
  await app.open();
  await app.menu('help', 'help');
  const link = page
    .getByTestId('help-dialog')
    .getByRole('link', { name: t('dialog.help.notices') });
  await expect(link).toHaveAttribute('href', 'THIRD_PARTY_NOTICES.txt');
  const response = await page.request.get(new URL('THIRD_PARTY_NOTICES.txt', page.url()).href);
  expect(response.ok()).toBe(true);
  const text = await response.text();
  expect(text).toContain('npm react ');
  expect(text).toContain('crates.io tauri ');
});
