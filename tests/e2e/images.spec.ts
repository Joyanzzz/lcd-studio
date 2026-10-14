import { GifWriter } from 'omggif';
import { writeFile } from 'node:fs/promises';
import { encodeIndexedPng } from '../../src/exporters/encoders/png.ts';
import { expect, test } from './fixtures.ts';

test.describe('importación de imágenes', () => {
  test('PNG: vista previa, conversión a 1 bit y aplicar', async ({ page, app }, info) => {
    // 80×16: mitad izquierda negra, mitad derecha blanca.
    const idx = new Uint8Array(80 * 16);
    for (let y = 0; y < 16; y++) for (let x = 40; x < 80; x++) idx[y * 80 + x] = 1;
    const png = info.outputPath('mitad.png');
    await writeFile(
      png,
      encodeIndexedPng(80, 16, idx, [
        [0, 0, 0],
        [255, 255, 255],
      ]),
    );
    await app.open();
    await app.panel('image');
    await page.getByTestId('image-input').setInputFiles(png);
    await expect(page.getByTestId('image-info')).toContainText('80 × 16');
    await expect(
      page
        .getByRole('region')
        .filter({ has: page.getByRole('button') })
        .first(),
    ).toBeVisible();
    await page.locator('select[id$="-dither"]').selectOption('threshold');
    await page.getByTestId('image-apply').click();
    const rows = await app.asciiRows();
    expect(rows[0]).toBe('#'.repeat(40) + '.'.repeat(40));
  });

  test('GIF animado: importar la secuencia como fotogramas', async ({ page, app, t }, info) => {
    const buf = new Uint8Array(8192);
    const w = new GifWriter(buf, 20, 8, { palette: [0x000000, 0xffffff], loop: 0 });
    for (let f = 0; f < 3; f++) {
      const px = new Array<number>(160).fill(1);
      for (let y = 0; y < 8; y++) px[y * 20 + f * 5] = 0;
      w.addFrame(0, 0, 20, 8, px, { delay: 10 + f * 10 });
    }
    const gif = info.outputPath('anim.gif');
    await writeFile(gif, buf.slice(0, w.end()));
    await app.open();
    await app.panel('image');
    await page.getByTestId('image-input').setInputFiles(gif);
    await expect(page.getByTestId('image-info')).toContainText('3');
    await page.getByTestId('image-sequence').click();
    await expect(
      page.getByRole('status').getByText(t('toast.sequenceImported', { frames: 3 })),
    ).toBeVisible();
    await app.showTimeline();
    await expect(page.getByTestId('frame-item')).toHaveCount(3);
    await expect(page.getByTestId('frame-item').nth(2)).toContainText('300 ms');
  });

  test('rechaza archivos que no son imágenes', async ({ page, app, t }, info) => {
    const fake = info.outputPath('no-imagen.png');
    await writeFile(fake, '<svg xmlns="http://www.w3.org/2000/svg"/>');
    await app.open();
    await app.panel('image');
    await page.getByTestId('image-input').setInputFiles(fake);
    await expect(page.getByRole('alert').getByText(t('image.unsupported'))).toBeVisible();
  });
});
