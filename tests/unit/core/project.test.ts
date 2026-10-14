import { describe, expect, it } from 'vitest';
import { convertProject } from '../../../src/core/convert.ts';
import { AppError } from '../../../src/core/errors.ts';
import {
  blankFrame,
  createFrame,
  createProject,
  deleteFrame,
  duplicateFrame,
  insertBlankFrame,
  insertFrames,
  isLoopMode,
  moveFrame,
  projectInvariantErrors,
  renameProject,
  replaceAllFrames,
  replaceFramePixels,
  replaceManyPixels,
  resizePixels,
  setAllDurations,
  setAppearance,
  setFrameDuration,
  setLoopMode,
  setRomCharset,
  type Project,
} from '../../../src/core/project.ts';

const base = () => createProject({ name: 'Prueba', profileId: 'hd44780-16x2' });

describe('proyecto', () => {
  it('crea proyectos con las dimensiones del perfil', () => {
    const p = base();
    expect(p.width).toBe(80);
    expect(p.height).toBe(16);
    expect(p.frames).toHaveLength(1);
    expect(p.frames[0]!.durationMs).toBe(200);
    expect(p.appearance).toEqual({ palette: 'lm016l' });
    expect(projectInvariantErrors(p)).toEqual([]);
    expect(Object.isFrozen(p)).toBe(true);
    expect(Object.isFrozen(p.frames)).toBe(true);
  });

  it('exige tamaño para la pantalla gráfica personalizada y lo valida', () => {
    expect(() => createProject({ name: 'x', profileId: 'graphic-custom' })).toThrow(/sizeRequired/);
    const p = createProject({ name: 'x', profileId: 'graphic-custom', width: 33, height: 7 });
    expect([p.width, p.height]).toEqual([33, 7]);
    expect(() =>
      createProject({ name: 'x', profileId: 'graphic-custom', width: 513, height: 7 }),
    ).toThrow(AppError);
    expect(() => createProject({ name: 'x', profileId: 'no-existe' })).toThrow(/unknownProfile/);
  });

  it('ignora tamaños personalizados en perfiles fijos', () => {
    const p = createProject({ name: 'x', profileId: 'ssd1306-128x32', width: 5, height: 5 });
    expect([p.width, p.height]).toEqual([128, 32]);
    expect(p.appearance).toEqual({ palette: 'oled' });
  });

  it('inserta, duplica, mueve y borra fotogramas', () => {
    let p = base();
    const px = new Uint8Array(p.width * p.height);
    px[5] = 1;
    p = replaceFramePixels(p, 0, px);
    p = duplicateFrame(p, 0);
    expect(p.frames).toHaveLength(2);
    expect(p.frames[1]!.pixels).toBe(p.frames[0]!.pixels);
    expect(p.frames[1]!.id).not.toBe(p.frames[0]!.id);
    p = insertBlankFrame(p, 2, 500);
    expect(p.frames[2]!.durationMs).toBe(500);
    const ids = p.frames.map((f) => f.id);
    p = moveFrame(p, 2, 0);
    expect(p.frames.map((f) => f.id)).toEqual([ids[2], ids[0], ids[1]]);
    expect(moveFrame(p, 1, 1)).toBe(p);
    p = deleteFrame(p, 0);
    expect(p.frames.map((f) => f.id)).toEqual([ids[0], ids[1]]);
    p = deleteFrame(p, 1);
    expect(() => deleteFrame(p, 0)).toThrow(/lastFrame/);
  });

  it('rechaza índices y tamaños inválidos', () => {
    const p = base();
    expect(() => replaceFramePixels(p, 1, new Uint8Array(80 * 16))).toThrow(/frameIndex/);
    expect(() => replaceFramePixels(p, -1, new Uint8Array(80 * 16))).toThrow(/frameIndex/);
    expect(() => replaceFramePixels(p, 0, new Uint8Array(3))).toThrow(/invalidFramePixels/);
    expect(() => moveFrame(p, 0, 3)).toThrow(/frameIndex/);
    expect(() => insertFrames(p, 5, [])).toThrow(/frameIndex/);
    expect(() => replaceManyPixels(p, new Map([[0, new Uint8Array(2)]]))).toThrow();
  });

  it('respeta el máximo de 240 fotogramas', () => {
    let p = base();
    const many = Array.from({ length: 239 }, () => blankFrame(80, 16));
    p = insertFrames(p, 1, many);
    expect(p.frames).toHaveLength(240);
    expect(() => insertBlankFrame(p, 0, 100)).toThrow(/tooManyFrames/);
    expect(() => duplicateFrame(p, 0)).toThrow(/tooManyFrames/);
    expect(() =>
      replaceAllFrames(
        p,
        Array.from({ length: 241 }, () => blankFrame(80, 16)),
      ),
    ).toThrow(/tooManyFrames/);
    expect(() => replaceAllFrames(p, [])).toThrow(/lastFrame/);
  });

  it('valida duraciones', () => {
    let p = base();
    expect(() => setFrameDuration(p, 0, 19)).toThrow(/invalidDuration/);
    expect(() => setFrameDuration(p, 0, 60_001)).toThrow(/invalidDuration/);
    expect(() => setFrameDuration(p, 0, NaN)).toThrow(/invalidDuration/);
    expect(() => setAllDurations(p, 1.5)).toThrow(/invalidDuration/);
    expect(() => createFrame(new Uint8Array(1), 5)).toThrow(/invalidDuration/);
    expect(setFrameDuration(p, 0, 200)).toBe(p);
    p = insertBlankFrame(p, 1, 300);
    p = setFrameDuration(p, 0, 20);
    expect(p.frames.map((f) => f.durationMs)).toEqual([20, 300]);
    p = setAllDurations(p, 60_000);
    expect(p.frames.map((f) => f.durationMs)).toEqual([60_000, 60_000]);
  });

  it('cambia propiedades con validación', () => {
    let p = base();
    p = setLoopMode(p, 'pingpong');
    expect(p.loopMode).toBe('pingpong');
    expect(() => setLoopMode(p, 'x' as never)).toThrow();
    expect(isLoopMode('once')).toBe(true);
    expect(isLoopMode('twice')).toBe(false);
    p = setAppearance(p, { palette: 'amber' });
    expect(() => setAppearance(p, { palette: 'nope' })).toThrow();
    p = setAppearance(p, {
      palette: 'custom',
      colors: { frame: '#000000', screen: '#111111', off: '#222222', on: '#ffffff' },
    });
    expect(() =>
      setAppearance(p, {
        palette: 'custom',
        colors: { frame: '#000', screen: '#111111', off: '#222222', on: '#ffffff' },
      }),
    ).toThrow();
    p = renameProject(p, '  Nuevo  nombre ');
    expect(p.name).toBe('Nuevo nombre');
    expect(() => renameProject(p, '   ')).toThrow(/invalidName/);
    p = setRomCharset(p, 'hd44780-a00');
    expect(p.romCharset).toBe('hd44780-a00');
    const g = createProject({ name: 'g', profileId: 'ssd1306-128x64' });
    expect(() => setRomCharset(g, 'hd44780-a00')).toThrow(/invalidRom/);
    expect(projectInvariantErrors(p)).toEqual([]);
  });

  it('recorta y amplía desde la esquina superior izquierda', () => {
    const px = Uint8Array.from([1, 0, 1, 0, 1, 0]);
    expect(Array.from(resizePixels(px, 3, 2, 2, 3))).toEqual([1, 0, 0, 1, 0, 0]);
    expect(Array.from(resizePixels(px, 3, 2, 4, 1))).toEqual([1, 0, 1, 0]);
  });

  it('cambia de perfil conservando los píxeles comunes', () => {
    let p = base();
    const px = new Uint8Array(80 * 16);
    px[0] = 1;
    px[79] = 1;
    p = replaceFramePixels(p, 0, px);
    p = setRomCharset(p, 'hd44780-a00');
    const q = convertProject(p, 'hd44780-20x4', undefined, 'crop-top-left').project;
    expect([q.width, q.height]).toEqual([100, 32]);
    expect(q.frames[0]!.pixels[0]).toBe(1);
    expect(q.frames[0]!.pixels[79]).toBe(1);
    expect(q.romCharset).toBe('hd44780-a00');
    const g = convertProject(
      q,
      'graphic-custom',
      { width: 10, height: 10 },
      'crop-top-left',
    ).project;
    expect(g.romCharset).toBe('none');
    expect(g.frames[0]!.pixels[0]).toBe(1);
    expect(projectInvariantErrors(g)).toEqual([]);
    expect(
      convertProject(g, 'graphic-custom', { width: 10, height: 10 }, 'scale').project.frames[0]!
        .pixels,
    ).toBe(g.frames[0]!.pixels);
    expect(() => convertProject(g, 'graphic-custom', undefined, 'scale')).toThrow(/sizeRequired/);
    expect(() =>
      convertProject(g, 'graphic-custom', { width: 0, height: 4 }, 'crop-top-left'),
    ).toThrow();
    expect(g.frames[0]!.pixels.length).toBe(100);
  });

  it('detecta invariantes rotas', () => {
    const p = base();
    const broken = (patch: Partial<Project>) => projectInvariantErrors({ ...p, ...patch });
    expect(broken({ profileId: 'x' })).toEqual(['project.unknownProfile']);
    expect(broken({ name: '' })).toContain('project.invalidName');
    expect(broken({ width: 81 })).toContain('project.invalidSize');
    expect(broken({ appearance: { palette: 'zzz' } })).toContain('project.invalidAppearance');
    expect(broken({ loopMode: 'x' as never })).toContain('project.invalidLoopMode');
    expect(broken({ romCharset: 'x' as never })).toContain('project.invalidRom');
    expect(broken({ frames: [] })).toContain('project.invalidFrameCount');
    expect(broken({ frames: [{ id: 1, durationMs: 200, pixels: new Uint8Array(3) }] })).toContain(
      'project.invalidFramePixels',
    );
    expect(
      broken({ frames: [{ id: 1, durationMs: 2, pixels: new Uint8Array(80 * 16) }] }),
    ).toContain('project.invalidDuration');
    const g = createProject({ name: 'g', profileId: 'ssd1306-128x64' });
    expect(projectInvariantErrors({ ...g, romCharset: 'hd44780-a00' })).toContain(
      'project.invalidRom',
    );
  });
});
