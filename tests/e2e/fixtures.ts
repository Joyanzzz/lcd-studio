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

  /** Abre un menú de la barra superior y activa una opción. */
  async menu(menuId: string, itemId: string): Promise<void> {
    await this.page.getByTestId(`menu-${menuId}`).click();
    await this.page.getByTestId(`menuitem-${itemId}`).click();
  }

  /** Abre una pestaña del panel lateral (lo despliega si está retraído). */
  async panel(id: 'draw' | 'image'): Promise<void> {
    const side = this.page.getByTestId('side-panel');
    if ((await side.getAttribute('data-open')) !== 'true') {
      await this.page.getByTestId('side-toggle').click();
    }
    await this.page.getByTestId(`tab-${id}`).click();
  }

  /** Retrae el panel lateral si está desplegado (en móvil tapa el lienzo). */
  async closePanel(): Promise<void> {
    const side = this.page.getByTestId('side-panel');
    if ((await side.getAttribute('data-open')) === 'true') {
      await this.page.getByTestId('side-close').click();
    }
  }

  /** Despliega la línea de tiempo si está plegada. */
  async showTimeline(): Promise<void> {
    const toggle = this.page.getByTestId('timeline-collapse');
    if ((await toggle.getAttribute('aria-expanded')) !== 'true') await toggle.click();
  }

  async tool(id: string): Promise<void> {
    await this.page.getByTestId(`tool-${id}`).click();
  }

  /**
   * Recorre el asistente de exportación hasta el resultado (no guarda nada).
   * `content`: fotograma actual, selección o animación completa.
   */
  async exportTo(
    exporterId: string,
    content: 'frame' | 'selection' | 'animation' = 'frame',
  ): Promise<void> {
    await this.menu('export', 'export');
    const dialog = this.page.getByTestId('export-dialog');
    await expect(dialog).toBeVisible();
    await this.page.getByTestId(`export-content-${content}`).check();
    await this.page.getByTestId('export-next').click();
    await this.page.getByTestId(`export-format-${exporterId}`).check();
    await this.page.getByTestId('export-next').click();
    await this.page.getByTestId('export-next').click();
    await expect(this.page.getByTestId('export-step-result')).toBeVisible();
  }

  async closeDialog(): Promise<void> {
    await this.page.keyboard.press('Escape');
    await expect(this.page.locator('dialog[open]')).toHaveCount(0);
  }

  /** Exporta el fotograma actual como ASCII y devuelve sus filas. */
  async asciiRows(): Promise<string[]> {
    await this.exportTo('ascii', 'frame');
    const text = await this.page.getByTestId('export-preview').inputValue();
    await this.closeDialog();
    return text.trimEnd().split('\n');
  }

  /**
   * Abre un archivo con el selector. Si hay cambios sin guardar en archivo,
   * la aplicación pregunta primero: se responde "No guardar".
   */
  async openProjectFile(path: string): Promise<void> {
    const chooser = this.page.waitForEvent('filechooser');
    await this.menu('file', 'open');
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

  /** Guarda (descarga) el proyecto con Archivo → Guardar. */
  async saveDownload(): Promise<Download> {
    const download = this.page.waitForEvent('download');
    await this.menu('file', 'save');
    return download;
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
