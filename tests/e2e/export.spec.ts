import { writeFile } from 'node:fs/promises';
import { serializeProject } from '../../src/core/project-format.ts';
import { ledDiagnosticFrames } from '../../src/core/led-diagnostics.ts';
import {
  createFrame,
  createProject,
  insertFrames,
  replaceFramePixels,
  setDevice,
  setLoopMode,
  type Project,
} from '../../src/core/project.ts';
import { getProfile, targetsFor } from '../../src/device-profiles/index.ts';
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

function ledProject(): Project {
  let p = createProject({ name: 'Matriz', profileId: 'max7219-8x8' });
  const frames = ledDiagnosticFrames();
  p = replaceFramePixels(p, 0, frames[0]!.pixels);
  p = insertFrames(p, 1, [createFrame(frames[1]!.pixels, 300)]);
  return setDevice(p, {
    connection: 'max7219-spi',
    codeTarget: 'arduino-max7219',
    matrix: { rotation: 90, wiring: 'cols-msb-top', brightness: 7 },
  });
}

for (const [label, build] of [
  ['LCD de caracteres', charProject],
  ['OLED SSD1306', oledProject],
  ['matriz de LEDs 8×8', ledProject],
] as const) {
  test(`exporta todos los formatos (${label}) con bytes idénticos al núcleo`, async ({
    page,
    app,
  }, info) => {
    test.setTimeout(240_000);
    const project = build();
    const path = info.outputPath('project.lcdstudio.json');
    await writeFile(path, serializeProject(project, { name: 'LCD Studio', version: 'e2e' }));
    await app.open();
    // Activar funciones experimentales para incluir PIC XC8.
    await app.menu('file', 'settings');
    await page.getByTestId('experimental').check();
    await page.keyboard.press('Escape');
    await app.openProjectFile(path);
    await expect(page.locator('.titlebar h1')).toContainText(project.name);

    const profile = getProfile(project.profileId)!;
    const exporters = exportersFor(profile, true).filter(
      (e) =>
        e.category !== 'code' ||
        targetsFor(profile, project.device.connection).some((x) => x.exporterId === e.id),
    );
    expect(exporters.length).toBeGreaterThanOrEqual(5);
    for (const exporter of exporters) {
      const content = exporter.contents.includes('animation') ? 'animation' : 'frame';
      await app.exportTo(exporter.id, content);
      const expected = runExport(
        exporter,
        { project, profile, currentFrame: 0, appVersion: '1.0.0' },
        { frames: content === 'animation' ? 'all' : 'current' },
      );
      expect(expected.files, exporter.id).toBeDefined();
      const files = expected.files!;
      const save = page.getByTestId('export-save');
      await expect(save, exporter.id).toBeEnabled({ timeout: 30_000 });
      const download = page.waitForEvent('download');
      await save.click();
      const d = await download;
      const bytes = await downloadBytes(d);
      if (files.length === 1) {
        expect(d.suggestedFilename(), exporter.id).toBe(files[0]!.name);
        expect(bytes, exporter.id).toEqual(files[0]!.data);
      } else {
        expect(bytes, exporter.id).toEqual(
          createZip(files.map((f) => ({ name: f.name, data: f.data }))),
        );
      }
      await expect(page.getByTestId('export-dialog')).toBeHidden();
    }
  });
}

test('el asistente solo ofrece formatos compatibles con el contenido y explica por qué', async ({
  page,
  app,
}) => {
  await app.open();
  await app.menu('export', 'export');
  // Un solo fotograma: no hay animación ni selección.
  await expect(page.getByTestId('export-content-animation')).toBeDisabled();
  await expect(page.getByTestId('export-content-selection')).toBeDisabled();
  await page.getByTestId('export-next').click();
  await expect(page.getByTestId('export-format-gif')).toBeDisabled();
  await expect(page.getByTestId('export-format-png')).toBeEnabled();
  await app.closeDialog();
  // Selección: solo imagen y datos, no código.
  await app.tool('select');
  await app.dragPixels([0, 0], [9, 7]);
  await app.menu('export', 'export');
  await page.getByTestId('export-content-selection').check();
  await page.getByTestId('export-next').click();
  await expect(page.getByTestId('export-format-arduino-liquidcrystal')).toBeDisabled();
  await page.getByTestId('export-format-binary').check();
  await page.getByTestId('export-next').click();
  await page.getByTestId('export-next').click();
  await expect(page.getByTestId('export-diagnostics')).toContainText('16');
});

test('cancelar el asistente no guarda archivos ni cambia el proyecto', async ({ page, app }) => {
  await app.open();
  await app.clickPixel(2, 2);
  let downloads = 0;
  page.on('download', () => downloads++);
  await app.exportTo('png', 'frame');
  await page.getByTestId('export-dialog').getByRole('button').last().click();
  await expect(page.getByTestId('export-dialog')).toBeHidden();
  expect(downloads).toBe(0);
  const rows = await app.asciiRows();
  expect(rows[2]!.slice(0, 3)).toBe('..#');
});

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
  await app.exportTo('adafruit-gfx', 'animation');
  await expect(
    page.getByTestId('export-diagnostics').locator('[data-severity="error"]').first(),
  ).toBeVisible();
  await expect(page.getByTestId('export-save')).toBeDisabled();
});
