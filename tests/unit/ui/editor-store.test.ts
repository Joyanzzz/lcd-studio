import { describe, expect, it } from 'vitest';
import { createProject, insertBlankFrame, type Project } from '../../../src/core/project.ts';
import {
  EditorStore,
  type Scheduler,
  type StoreEvent,
} from '../../../src/ui/state/editor-store.ts';
import { toAscii } from '../../helpers/bitmap.ts';

const small = (): Project =>
  createProject({ name: 'x', profileId: 'graphic-custom', width: 6, height: 4 });

function manualScheduler(): Scheduler & { run: () => void; pending: number } {
  const queue: (() => void)[] = [];
  return {
    setTimeout: (fn) => {
      queue.push(fn);
      return queue.length;
    },
    clearTimeout: () => {
      queue.length = 0;
    },
    run: () => queue.shift()?.(),
    get pending() {
      return queue.length;
    },
  };
}

const ascii = (s: EditorStore) =>
  toAscii(s.currentFrame.pixels, s.getState().project.width, s.getState().project.height);

describe('almacén del editor: dibujo', () => {
  it('lápiz con trazo continuo y un único paso de historial', () => {
    const s = new EditorStore(small());
    const lives: unknown[] = [];
    s.subscribeLive((l) => lives.push(l));
    s.pointerDown({ x: 0, y: 0 });
    s.pointerMove({ x: 3, y: 0 });
    expect(s.live?.dirty).toEqual({ x0: 0, y0: 0, x1: 3, y1: 0 });
    s.pointerUp();
    expect(ascii(s)[0]).toBe('####..');
    expect(s.getState().undoLabel).toBe('history.draw');
    expect(s.getState().fileDirty).toBe(true);
    expect(lives.at(-1)).toBeNull();
    s.undo();
    expect(ascii(s)[0]).toBe('......');
    s.redo();
    expect(ascii(s)[0]).toBe('####..');
  });

  it('borrador y clic derecho apagan píxeles', () => {
    const s = new EditorStore(small());
    s.setTool('rect');
    s.setFilled(true);
    s.pointerDown({ x: 0, y: 0 });
    s.pointerMove({ x: 5, y: 3 });
    s.pointerUp();
    s.setTool('pencil');
    s.pointerDown({ x: 1, y: 1 }, { erase: true });
    s.pointerUp();
    s.setTool('eraser');
    s.pointerDown({ x: 2, y: 1 });
    s.pointerUp();
    expect(ascii(s)[1]).toBe('#..###');
  });

  it('formas con vista previa y restricción con Mayús', () => {
    const s = new EditorStore(small());
    s.setTool('line');
    s.pointerDown({ x: 0, y: 0 });
    s.pointerMove({ x: 5, y: 3 });
    s.pointerMove({ x: 5, y: 1 }, { constrain: true });
    s.pointerUp();
    expect(ascii(s)).toEqual(['######', '......', '......', '......']);
    s.setTool('ellipse');
    s.pointerDown({ x: 0, y: 0 });
    s.pointerMove({ x: 9, y: 9 });
    s.pointerUp();
    expect(s.getState().undoLabel).toBe('history.ellipse');
  });

  it('simetría horizontal y vertical', () => {
    const s = new EditorStore(small());
    s.setSymmetry({ horizontal: true, vertical: true });
    s.pointerDown({ x: 0, y: 0 });
    s.pointerUp();
    expect(ascii(s)).toEqual(['#....#', '......', '......', '#....#']);
  });

  it('relleno y texto', () => {
    const s = new EditorStore(createProject({ name: 'x', profileId: 'hd44780-16x2' }));
    s.setTool('fill');
    s.pointerDown({ x: 3, y: 3 });
    expect(s.currentFrame.pixels.every((v) => v === 1)).toBe(true);
    s.undo();
    s.setTool('text');
    s.setText({ value: 'A' });
    s.pointerDown({ x: 7, y: 9 });
    // Se alinea a la celda (5, 8).
    expect(s.currentFrame.pixels[8 * 80 + 6]).toBe(1);
    const events: StoreEvent[] = [];
    s.onEvent((e) => events.push(e));
    s.setText({ value: 'ñ' });
    s.pointerDown({ x: 0, y: 0 });
    expect(events[0]).toMatchObject({ type: 'error', code: 'draw.textUnsupported' });
    s.setText({ value: '' });
    s.pointerDown({ x: 0, y: 0 });
    s.pointerDown({ x: 999, y: 0 });
  });

  it('no registra pasos de historial si nada cambia', () => {
    const s = new EditorStore(small());
    s.setTool('eraser');
    s.pointerDown({ x: 1, y: 1 });
    s.pointerUp();
    expect(s.getState().canUndo).toBe(false);
    s.pointerMove({ x: 1, y: 1 });
    s.pointerUp();
  });

  it('teclado: mover cursor y cambiar píxel', () => {
    const s = new EditorStore(small());
    s.cursorPixel('toggle');
    s.setCursor({ x: 0, y: 0 });
    s.moveCursor(2, 1);
    s.moveCursor(99, 99);
    expect(s.getState().cursor).toEqual({ x: 5, y: 3 });
    s.cursorPixel('toggle');
    expect(s.currentFrame.pixels[3 * 6 + 5]).toBe(1);
    s.cursorPixel('toggle');
    expect(s.currentFrame.pixels[3 * 6 + 5]).toBe(0);
    s.cursorPixel('toggle');
    s.cursorPixel('off');
    expect(s.currentFrame.pixels[3 * 6 + 5]).toBe(0);
    s.setCursor(null);
  });
});

describe('almacén del editor: selección', () => {
  function withDot() {
    const s = new EditorStore(small());
    s.pointerDown({ x: 1, y: 1 });
    s.pointerUp();
    s.setTool('select');
    return s;
  }

  it('selecciona, mueve y copia con arrastre', () => {
    const s = withDot();
    s.pointerDown({ x: 0, y: 0 });
    s.pointerMove({ x: 2, y: 2 });
    s.pointerUp();
    expect(s.getState().selection).toEqual({ x: 0, y: 0, width: 3, height: 3 });
    s.pointerDown({ x: 1, y: 1 });
    s.pointerMove({ x: 3, y: 1 });
    s.pointerUp();
    expect(ascii(s)[1]).toBe('...#..');
    expect(s.getState().selection).toEqual({ x: 2, y: 0, width: 3, height: 3 });
    s.pointerDown({ x: 3, y: 1 }, { copy: true });
    s.pointerMove({ x: 3, y: 2 });
    s.pointerUp();
    // La copia flotante reemplaza el rectángulo de destino completo.
    expect(ascii(s).slice(1, 3)).toEqual(['......', '...#..']);
    expect(s.getState().undoLabel).toBe('history.copyMove');
  });

  it('un clic sin arrastrar quita la selección', () => {
    const s = withDot();
    s.pointerDown({ x: 4, y: 3 });
    s.pointerUp();
    expect(s.getState().selection).toBeNull();
    s.selectAll();
    s.pointerDown({ x: 1, y: 1 });
    s.pointerUp();
    expect(s.getState().selection).toEqual({ x: 0, y: 0, width: 6, height: 4 });
  });

  it('copiar, cortar, pegar, borrar y desplazar con flechas', () => {
    const s = withDot();
    expect(s.copy()).toBe(false);
    expect(s.paste()).toBe(false);
    expect(s.cut()).toBe(false);
    expect(s.deleteSelection()).toBe(false);
    expect(s.nudgeSelection(1, 0)).toBe(false);
    s.selectAll();
    expect(s.copy()).toBe(true);
    expect(s.cut()).toBe(true);
    expect(s.currentFrame.pixels.every((v) => v === 0)).toBe(true);
    s.deselect();
    expect(s.paste()).toBe(true);
    expect(s.currentFrame.pixels[1 * 6 + 1]).toBe(1);
    expect(s.nudgeSelection(1, 0)).toBe(true);
    expect(s.currentFrame.pixels[1 * 6 + 2]).toBe(1);
    expect(s.nudgeSelection(-50, 0)).toBe(false);
    expect(s.deleteSelection()).toBe(true);
    expect(s.currentFrame.pixels.every((v) => v === 0)).toBe(true);
    s.setTool('pencil');
    expect(s.getState().selection).toBeNull();
  });
});

describe('almacén del editor: fotogramas, transformaciones y reproducción', () => {
  it('crea, duplica, mueve y borra fotogramas', () => {
    const s = new EditorStore(small());
    s.pointerDown({ x: 0, y: 0 });
    s.pointerUp();
    s.duplicateFrame();
    expect(s.getState().current).toBe(1);
    s.newFrame();
    expect(s.getState().project.frames).toHaveLength(3);
    s.moveFrame(2, 0);
    expect(s.getState().current).toBe(0);
    s.moveFrame(0, 0);
    s.selectFrame(99);
    expect(s.getState().current).toBe(2);
    s.deleteFrame();
    expect(s.getState().project.frames).toHaveLength(2);
    s.deleteFrame();
    const events: StoreEvent[] = [];
    s.onEvent((e) => events.push(e));
    s.deleteFrame();
    expect(events[0]).toMatchObject({ type: 'error', code: 'project.lastFrame' });
  });

  it('duraciones con validación', () => {
    const s = new EditorStore(small());
    const events: StoreEvent[] = [];
    s.onEvent((e) => events.push(e));
    s.setDuration(10);
    expect(events[0]?.code).toBe('project.invalidDuration');
    s.setDuration(500);
    s.newFrame();
    expect(s.currentFrame.durationMs).toBe(500);
    s.setAllDurations(40);
    expect(s.getState().project.frames.map((f) => f.durationMs)).toEqual([40, 40]);
  });

  it('transforma el fotograma actual o todos', () => {
    const s = new EditorStore(insertBlankFrame(small(), 1, 100));
    s.invert();
    expect(s.getState().project.frames[1]!.pixels.every((v) => v === 0)).toBe(true);
    s.setTransformAll(true);
    s.clear();
    s.invert();
    expect(s.getState().project.frames.every((f) => f.pixels.every((v) => v === 1))).toBe(true);
    s.setTransformAll(false);
    s.clear();
    s.pointerDown({ x: 0, y: 0 });
    s.pointerUp();
    s.flipH();
    expect(ascii(s)[0]).toBe('.....#');
    s.flipV();
    expect(ascii(s)[3]).toBe('.....#');
    s.shift(1, 0);
    expect(ascii(s)[3]).toBe('#.....');
    s.setWrapShift(false);
    s.shift(-1, 0);
    expect(ascii(s)[3]).toBe('......');
  });

  it('reproduce según el modo y se detiene en "una vez"', () => {
    const sched = manualScheduler();
    let p = insertBlankFrame(small(), 1, 100);
    p = insertBlankFrame(p, 2, 100);
    const s = new EditorStore(p, { scheduler: sched });
    s.setLoopMode('once');
    s.play();
    expect(s.getState().playing).toBe(true);
    sched.run();
    sched.run();
    expect(s.getState().current).toBe(2);
    sched.run();
    expect(s.getState().playing).toBe(false);
    s.togglePlay();
    s.togglePlay();
    expect(s.getState().playing).toBe(false);
    const single = new EditorStore(small(), { scheduler: sched });
    single.play();
    expect(single.getState().playing).toBe(false);
  });
});

describe('almacén del editor: proyecto e imagen', () => {
  it('vista previa: reemplazar, superponer y como fotograma nuevo', () => {
    const s = new EditorStore(small());
    s.pointerDown({ x: 0, y: 0 });
    s.pointerUp();
    const img = new Uint8Array(24);
    img[23] = 1;
    s.setPreview(img, 'or');
    s.pointerDown({ x: 3, y: 3 });
    expect(s.displayPixels()[0]).toBe(1);
    expect(s.displayPixels()[23]).toBe(1);
    s.applyPreview(false);
    expect(s.currentFrame.pixels[23]).toBe(1);
    expect(s.getState().preview).toBeNull();
    s.applyPreview(false);
    s.setPreview(img, 'replace');
    s.applyPreview(true);
    expect(s.getState().project.frames).toHaveLength(2);
    expect(s.currentFrame.pixels[0]).toBe(0);
    expect(() => s.setPreview(new Uint8Array(3))).toThrow();
  });

  it('importa secuencias respetando el máximo de fotogramas', () => {
    const s = new EditorStore(small());
    const frames = Array.from({ length: 3 }, () => ({
      pixels: new Uint8Array(24),
      durationMs: 70,
    }));
    expect(s.importSequence(frames, false)).toBe(true);
    expect(s.getState().project.frames).toHaveLength(4);
    expect(s.importSequence(frames, true)).toBe(true);
    expect(s.getState().project.frames).toHaveLength(3);
    const many = Array.from({ length: 241 }, () => ({
      pixels: new Uint8Array(24),
      durationMs: 70,
    }));
    expect(s.importSequence(many, true)).toBe(false);
  });

  it('cambia perfil, apariencia, ROM, nombre y modo', () => {
    const s = new EditorStore(createProject({ name: 'x', profileId: 'hd44780-16x2' }));
    s.setRomCharset('hd44780-a00');
    s.setAppearance({ palette: 'amber' });
    s.rename('Nuevo');
    s.setLoopMode('pingpong');
    expect(s.changeProfile('graphic-custom', { width: 10, height: 10 })).toBe(true);
    expect(s.getState().project).toMatchObject({
      name: 'Nuevo',
      width: 10,
      romCharset: 'none',
      loopMode: 'pingpong',
    });
    expect(s.changeProfile('graphic-custom')).toBe(false);
    s.loadProject(small(), true);
    expect(s.getState()).toMatchObject({ canUndo: false, fileDirty: true, current: 0 });
    s.markFileSaved();
    expect(s.getState().fileDirty).toBe(false);
    s.undo();
    s.redo();
  });

  it('acota opciones del editor', () => {
    const s = new EditorStore(small());
    s.setOnion({ enabled: true, before: 9, after: -1, opacity: 200 });
    expect(s.getState().onion).toEqual({ enabled: true, before: 5, after: 0, opacity: 90 });
    s.setText({ value: 'x'.repeat(100), scale: 9, advance: 3 });
    expect(s.getState().text).toEqual({ value: 'x'.repeat(64), scale: 4, advance: 6 });
    s.setHover({ x: 1, y: 1 });
    const before = s.getState();
    s.setHover({ x: 1, y: 1 });
    expect(s.getState()).toBe(before);
    s.dispose();
  });

  it('avisa cuando una operación no se puede deshacer por tamaño', () => {
    const p = createProject({ name: 'b', profileId: 'graphic-custom', width: 100, height: 100 });
    const s = new EditorStore(p, { historyMaxBytes: 5000 });
    const events: StoreEvent[] = [];
    s.onEvent((e) => events.push(e));
    s.invert();
    expect(events.map((e) => e.code)).toEqual(['toast.notUndoable']);
    expect(s.getState().canUndo).toBe(false);
    expect(s.currentFrame.pixels[0]).toBe(1);
  });
});
