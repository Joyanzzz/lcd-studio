import { test as base, expect, type Download, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { en } from '../../src/ui/i18n/en.ts';
import { es, type MessageKey } from '../../src/ui/i18n/es.ts';
import { createTranslator } from '../../src/ui/i18n/translate.ts';

/**
 * Utilidades comunes de las pruebas E2E. Las pruebas no dependen del idioma:
 * los textos esperados se obtienen de los mismos diccionarios que usa la
 * aplicación, según el idioma del proyecto de Playwright.
 */

export type T = (key: MessageKey, params?: Record<string, string | number>) => string;

export class AppPage {
  readonly page: Page;
  readonly t: T;

  constructor(page: Page, t: T) {
    this.page = page;
    this.t = t;
  }

  async open(): Promise<void> {
    await this.page.goto('/');
    await expect(this.canvas).toBeVisible();
  }

  get canvas() {
    return this.page.getByTestId('lcd-canvas');
  }

  /** Clic en el píxel (x, y) del proyecto usando la geometría del lienzo. */
  async clickPixel(x: number, y: number, button: 'left' | 'right' = 'left'): Promise<void> {
    const pos = await this.pixelPosition(x, y);
    await this.canvas.click({ position: pos, button });
  }

  async pixelPosition(x: number, y: number): Promise<{ x: number; y: number }> {
    const attrs = await this.canvas.evaluate((el) => ({
      zoom: Number(el.dataset['zoom']),
      pad: Number(el.dataset['pad']),
      gapX: Number(el.dataset['gapX']),
      gapY: Number(el.dataset['gapY']),
    }));
    const px = attrs.pad + x * attrs.zoom + Math.floor(x / 5) * attrs.gapX + attrs.zoom / 2;
    const py = attrs.pad + y * attrs.zoom + Math.floor(y / 8) * attrs.gapY + attrs.zoom / 2;
    return { x: px, y: py };
  }

  async dragPixels(from: [number, number], to: [number, number]): Promise<void> {
    const box = await this.canvas.boundingBox();
    if (!box) throw new Error('Sin lienzo');
    const a = await this.pixelPosition(...from);
    const b = await this.pixelPosition(...to);
    await this.page.mouse.move(box.x + a.x, box.y + a.y);
    await this.page.mouse.down();
    await this.page.mouse.move(box.x + (a.x + b.x) / 2, box.y + (a.y + b.y) / 2, { steps: 3 });
    await this.page.mouse.move(box.x + b.x, box.y + b.y, { steps: 3 });
    await this.page.mouse.up();
  }

  /** Abre una pestaña del panel lateral (en móvil, primero la sección de paneles). */
  async panel(id: 'draw' | 'image' | 'export' | 'project'): Promise<void> {
    const nav = this.page.getByRole('navigation', { name: this.t('mobile.nav') });
    if (await nav.isVisible())
      await nav.getByRole('button', { name: this.t('mobile.panels') }).click();
    await this.page.getByTestId(`tab-${id}`).click();
  }

  async showTimeline(): Promise<void> {
    const nav = this.page.getByRole('navigation', { name: this.t('mobile.nav') });
    if (await nav.isVisible())
      await nav.getByRole('button', { name: this.t('mobile.timeline') }).click();
  }

  async showTools(): Promise<void> {
    const nav = this.page.getByRole('navigation', { name: this.t('mobile.nav') });
    if (await nav.isVisible())
      await nav.getByRole('button', { name: this.t('mobile.tools') }).click();
  }

  async tool(id: string): Promise<void> {
    await this.showTools();
    await this.page.getByTestId(`tool-${id}`).click();
  }

  /** Exporta el fotograma actual como ASCII y devuelve sus filas. */
  async asciiRows(): Promise<string[]> {
    await this.panel('export');
    await this.page.getByTestId('export-format').selectOption('ascii');
    await this.page.getByTestId('export-generate').click();
    const text = await this.page.getByTestId('export-preview').inputValue();
    return text.trimEnd().split('\n');
  }

  /**
   * Abre un archivo con el selector. Si hay cambios sin guardar en archivo,
   * la aplicación pregunta primero: se responde "No guardar".
   */
  async openProjectFile(path: string): Promise<void> {
    const chooser = this.page.waitForEvent('filechooser');
    await this.page.getByRole('button', { name: this.t('toolbar.open'), exact: true }).click();
    const unsaved = this.page.getByTestId('unsaved-dialog');
    const first = await Promise.race([
      chooser.then(() => 'chooser' as const),
      unsaved.waitFor({ state: 'visible' }).then(() => 'dialog' as const),
    ]);
    if (first === 'dialog') {
      await unsaved.getByRole('button', { name: this.t('dialog.unsaved.discard') }).click();
    }
    await (await chooser).setFiles(path);
  }

  async waitSaved(): Promise<void> {
    await expect(this.page.getByTestId('save-status')).toHaveText(this.t('save.status.saved'), {
      timeout: 15_000,
    });
  }
}

export async function downloadBytes(download: Download): Promise<Uint8Array> {
  const path = await download.path();
  return new Uint8Array(await readFile(path));
}

export const test = base.extend<{ t: T; app: AppPage }>({
  t: async ({ locale }, use) => {
    const lang = locale?.startsWith('en') ? 'en' : 'es';
    const tr = createTranslator(lang, lang === 'en' ? en : es);
    await use((key, params) => tr.t(key, params));
  },
  app: async ({ page, t }, use) => {
    await use(new AppPage(page, t));
  },
});

export { expect };
