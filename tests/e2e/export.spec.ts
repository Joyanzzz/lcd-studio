import { writeFile } from 'node:fs/promises';
import { serializeProject } from '../../src/core/project-format.ts';
import {
  createFrame,
  createProject,
  insertFrames,
  replaceFramePixels,
  setLoopMode,
  type Project,
} from '../../src/core/project.ts';
import { getProfile } from '../../src/device-profiles/index.ts';
import { exportersFor, runExport } from '../../src/exporters/index.ts';
import { createZip } from '../../src/core/zip.ts';
import { downloadBytes, expect, test } from './fixtures.ts';

/**
 * Exporta cada formato desde la interfaz y compara los bytes descargados con
 * los que produce el núcleo en Node para el mismo proyecto. La aplicación de
 * escritorio ejecuta exactamente el mismo paquete JavaScript, de modo que esta
 * igualdad es la base de "mismos archivos en web y escritorio".
 */

function charProject(): Project {
  let p = createProject({ name: 'Caras', profileId: 'hd44780-16x2' });
  const px = new Uint8Array(80 * 16);
  [
    [1, 1],
    [3, 1],
    [0, 4],
    [4, 4],
    [1, 5],
    [2, 5],
    [3, 5],
    [7, 2],
    [8, 3],
    [12, 9],
  ].forEach(([x, y]) => (px[y! * 80 + x!] = 1));
  p = replaceFramePixels(p, 0, px);
  const px2 = new Uint8Array(80 * 16);
  for (let x = 0; x < 80; x += 3) px2[x] = 1;
  p = insertFrames(p, 1, [createFrame(px2, 150)]);
  return setLoopMode(p, 'pingpong');
}

function oledProject(): Project {
  let p = createProject({ name: 'Logo', profileId: 'ssd1306-128x64' });
  const px = new Uint8Array(128 * 64);
  for (let y = 0; y < 64; y++)
    for (let x = 0; x < 128; x++) if ((x * y) % 7 === 0 || x === y) px[y * 128 + x] = 1;
  p = replaceFramePixels(p, 0, px);
  return insertFrames(p, 1, [
    createFrame(
      px.map((v) => (v ? 0 : 1)),
      80,
    ),
  ]);
}

for (const [label, build] of [
  ['LCD de caracteres', charProject],
  ['OLED SSD1306', oledProject],
] as const) {
  test(`exporta todos los formatos (${label}) con bytes idénticos al núcleo`, async ({
    page,
    app,
    t,
  }, info) => {
    test.setTimeout(180_000);
    const project = build();
    const path = info.outputPath('project.lcdstudio.json');
    await writeFile(path, serializeProject(project, { name: 'LCD Studio', version: 'e2e' }));
    await app.open();
    // Activar funciones experimentales para incluir PIC XC8.
    await page.getByRole('button', { name: t('toolbar.settings') }).click();
    await page.getByTestId('experimental').check();
    await page
      .getByTestId('settings-dialog')
      .getByRole('button', { name: t('dialog.ok') })
      .click();
    await app.openProjectFile(path);
    await expect(page.locator('.titlebar h1')).toContainText(project.name);
    await app.panel('export');

    const profile = getProfile(project.profileId)!;
    const exporters = exportersFor(profile, true);
    expect(exporters.length).toBeGreaterThanOrEqual(7);
    for (const exporter of exporters) {
      await page.getByTestId('export-format').selectOption(exporter.id);
      await page.getByTestId('export-generate').click();
      const expected = runExport(
        exporter,
        { project, profile, currentFrame: 0, appVersion: '1.0.0' },
        {},
      );
      expect(expected.files, exporter.id).toBeDefined();
      const files = expected.files!;
      if (files.length === 1) {
        const download = page.waitForEvent('download');
        await page.getByTestId('export-download').click();
        const d = await download;
        expect(d.suggestedFilename(), exporter.id).toBe(files[0]!.name);
        expect(await downloadBytes(d), exporter.id).toEqual(files[0]!.data);
      } else {
        const download = page.waitForEvent('download');
        await page.getByTestId('export-zip').click();
        const bytes = await downloadBytes(await download);
        expect(bytes, exporter.id).toEqual(
          createZip(files.map((f) => ({ name: f.name, data: f.data }))),
        );
      }
    }
  });
}

test('advierte y bloquea antes de una exportación incompatible', async ({ page, app }, info) => {
  let p = createProject({ name: 'Grande', profileId: 'ssd1306-128x64' });
  p = insertFrames(
    p,
    1,
    Array.from({ length: 40 }, () => createFrame(new Uint8Array(128 * 64), 100)),
  );
  const path = info.outputPath('grande.lcdstudio.json');
  await writeFile(path, serializeProject(p, { name: 'LCD Studio', version: 'e2e' }));
  await app.open();
  await app.openProjectFile(path);
  await app.panel('export');
  await page.getByTestId('export-format').selectOption('adafruit-gfx');
  await expect(
    page.getByTestId('export-diagnostics').locator('[data-severity="error"]').first(),
  ).toBeVisible();
  await expect(page.getByTestId('export-generate')).toBeDisabled();
});
