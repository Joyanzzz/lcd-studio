import { type Appearance } from '../../core/appearance.ts';
import { AppError, isAppError } from '../../core/errors.ts';
import { History, projectRetainedBytes } from '../../core/history.ts';
import { LIMITS } from '../../core/limits.ts';
import { nextPlaybackStep, type PlaybackState } from '../../core/playback.ts';
import {
  changeProfile,
  createFrame,
  deleteFrame,
  duplicateFrame,
  insertBlankFrame,
  insertFrames,
  moveFrame,
  renameProject,
  replaceAllFrames,
  replaceFramePixels,
  replaceManyPixels,
  setAllDurations,
  setAppearance,
  setFrameDuration,
  setLoopMode,
  setRomCharset,
  type LoopMode,
  type Project,
} from '../../core/project.ts';
import { getProfile, type RomCharsetId } from '../../device-profiles/index.ts';
import { DrawSurface, type DirtyRect, type Symmetry } from '../../engine/draw.ts';
import { floodFill } from '../../engine/fill.ts';
import { constrainEnd, type Point } from '../../engine/geometry.ts';
import {
  clipRect,
  extractRegion,
  fillRegion,
  moveRegion,
  rectContains,
  rectFromPoints,
  stampClip,
  type Clip,
  type Rect,
} from '../../engine/selection.ts';
import { drawText, unsupportedTextChars } from '../../engine/text.ts';
import {
  clearPixels,
  flipHorizontal,
  flipVertical,
  invertPixels,
  shiftPixels,
} from '../../engine/transform.ts';

/**
 * Estado del editor y todas sus acciones. Es TypeScript puro (sin React ni
 * DOM) para poder probarlo en Node; la interfaz se suscribe con
 * `useSyncExternalStore`.
 */

export type ToolId = 'select' | 'pencil' | 'eraser' | 'fill' | 'line' | 'rect' | 'ellipse' | 'text';
export const TOOLS: readonly ToolId[] = [
  'select',
  'pencil',
  'eraser',
  'fill',
  'line',
  'rect',
  'ellipse',
  'text',
];

export interface OnionSettings {
  readonly enabled: boolean;
  readonly before: number;
  readonly after: number;
  /** Opacidad en % (10–90). */
  readonly opacity: number;
}

export interface TextSettings {
  readonly value: string;
  readonly scale: number;
  /** Avance horizontal en píxeles (5 o 6). */
  readonly advance: number;
}

export interface EditorState {
  readonly project: Project;
  readonly current: number;
  readonly tool: ToolId;
  readonly filled: boolean;
  readonly symmetry: Symmetry;
  readonly selection: Rect | null;
  readonly clipboard: Clip | null;
  readonly onion: OnionSettings;
  readonly text: TextSettings;
  readonly transformAll: boolean;
  readonly wrapShift: boolean;
  readonly playing: boolean;
  /** Imagen en vista previa sobre el fotograma actual. */
  readonly preview: Uint8Array | null;
  readonly previewMode: 'replace' | 'or';
  /** Cursor de teclado sobre el lienzo. */
  readonly cursor: Point | null;
  /** Posición del puntero (barra de estado). */
  readonly hover: Point | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  readonly undoLabel: string | undefined;
  readonly redoLabel: string | undefined;
  /** Cambios desde la última apertura o guardado en archivo. */
  readonly fileDirty: boolean;
  /** Aumenta con cada cambio del proyecto (para el autoguardado). */
  readonly revision: number;
}

export type StoreEvent =
  | {
      readonly type: 'notice';
      readonly code: string;
      readonly params?: Record<string, string | number>;
    }
  | {
      readonly type: 'error';
      readonly code: string;
      readonly params?: Record<string, string | number>;
    };

/** Píxeles en edición (trazo en curso) y región modificada, para redibujar solo lo necesario. */
export interface LiveBuffer {
  readonly pixels: Uint8Array;
  readonly dirty: DirtyRect | null;
}

interface Stroke {
  readonly tool: ToolId;
  readonly value: 0 | 1;
  readonly base: Uint8Array;
  readonly surface: DrawSurface;
  readonly start: Point;
  last: Point;
  /** Para mover la selección. */
  readonly moveRect?: Rect;
  readonly copy?: boolean;
  readonly selecting?: boolean;
}

export interface Scheduler {
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

const defaultScheduler: Scheduler = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
};

export class EditorStore {
  private state: EditorState;
  private readonly listeners = new Set<() => void>();
  private readonly liveListeners = new Set<(live: LiveBuffer | null) => void>();
  private readonly eventListeners = new Set<(event: StoreEvent) => void>();
  private readonly history: History<Project>;
  private stroke: Stroke | null = null;
  private playTimer: unknown = null;
  private playState: PlaybackState = { index: 0, direction: 1 };
  private readonly scheduler: Scheduler;

  constructor(
    project: Project,
    options: { fileDirty?: boolean; scheduler?: Scheduler; historyMaxBytes?: number } = {},
  ) {
    this.scheduler = options.scheduler ?? defaultScheduler;
    this.history = new History<Project>({
      cost: projectRetainedBytes,
      ...(options.historyMaxBytes !== undefined ? { maxBytes: options.historyMaxBytes } : {}),
    });
    this.state = {
      project,
      current: 0,
      tool: 'pencil',
      filled: false,
      symmetry: { horizontal: false, vertical: false },
      selection: null,
      clipboard: null,
      onion: { enabled: false, before: 1, after: 1, opacity: 45 },
      text: { value: 'Hola', scale: 1, advance: 6 },
      transformAll: false,
      wrapShift: true,
      playing: false,
      preview: null,
      previewMode: 'replace',
      cursor: null,
      hover: null,
      canUndo: false,
      canRedo: false,
      undoLabel: undefined,
      redoLabel: undefined,
      fileDirty: options.fileDirty ?? false,
      revision: 0,
    };
  }

  // ---------- Suscripción ----------

  getState = (): EditorState => this.state;

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  subscribeLive(listener: (live: LiveBuffer | null) => void): () => void {
    this.liveListeners.add(listener);
    return () => this.liveListeners.delete(listener);
  }

  onEvent(listener: (event: StoreEvent) => void): () => void {
    this.eventListeners.add(listener);
    return () => this.eventListeners.delete(listener);
  }

  private set(patch: Partial<EditorState>): void {
    this.state = { ...this.state, ...patch };
    for (const l of this.listeners) l();
  }

  private emit(event: StoreEvent): void {
    for (const l of this.eventListeners) l(event);
  }

  private emitLive(live: LiveBuffer | null): void {
    for (const l of this.liveListeners) l(live);
  }

  private historyPatch(): Partial<EditorState> {
    return {
      canUndo: this.history.canUndo,
      canRedo: this.history.canRedo,
      undoLabel: this.history.undoLabel,
      redoLabel: this.history.redoLabel,
    };
  }

  /** Aplica un cambio de proyecto registrándolo en el historial. */
  commit(next: Project, label: string, extra: Partial<EditorState> = {}): void {
    const previous = this.state.project;
    if (next === previous) return;
    const result = this.history.push(previous, next, label);
    if (!result.undoable) this.emit({ type: 'notice', code: 'toast.notUndoable' });
    const current = Math.min(extra.current ?? this.state.current, next.frames.length - 1);
    this.set({
      ...extra,
      project: next,
      current,
      fileDirty: true,
      revision: this.state.revision + 1,
      ...this.historyPatch(),
    });
  }

  /** Ejecuta una operación que puede lanzar `AppError` y la notifica como error. */
  private attempt(fn: () => void): boolean {
    try {
      fn();
      return true;
    } catch (error) {
      if (isAppError(error))
        this.emit({ type: 'error', code: error.code, params: { ...error.params } });
      else throw error;
      return false;
    }
  }

  // ---------- Proyecto ----------

  /** Sustituye el proyecto (nuevo, abierto o recuperado) y vacía el historial. */
  loadProject(project: Project, fileDirty = false): void {
    this.stop();
    this.cancelStroke();
    this.history.clear();
    this.set({
      project,
      current: 0,
      selection: null,
      preview: null,
      cursor: null,
      fileDirty,
      revision: this.state.revision + 1,
      ...this.historyPatch(),
    });
  }

  markFileSaved(): void {
    this.set({ fileDirty: false });
  }

  get currentFrame() {
    return this.state.project.frames[this.state.current]!;
  }

  undo(): void {
    this.stop();
    this.cancelStroke();
    const previous = this.history.undo(this.state.project);
    if (!previous) return;
    this.set({
      project: previous,
      current: Math.min(this.state.current, previous.frames.length - 1),
      selection: null,
      preview: null,
      fileDirty: true,
      revision: this.state.revision + 1,
      ...this.historyPatch(),
    });
  }

  redo(): void {
    this.stop();
    this.cancelStroke();
    const next = this.history.redo(this.state.project);
    if (!next) return;
    this.set({
      project: next,
      current: Math.min(this.state.current, next.frames.length - 1),
      selection: null,
      preview: null,
      fileDirty: true,
      revision: this.state.revision + 1,
      ...this.historyPatch(),
    });
  }

  rename(name: string): void {
    this.attempt(() => this.commit(renameProject(this.state.project, name), 'history.rename'));
  }

  setLoopMode(mode: LoopMode): void {
    this.attempt(() => this.commit(setLoopMode(this.state.project, mode), 'history.loopMode'));
  }

  setAppearance(appearance: Appearance): void {
    this.attempt(() =>
      this.commit(setAppearance(this.state.project, appearance), 'history.appearance'),
    );
  }

  setRomCharset(rom: RomCharsetId): void {
    this.attempt(() => this.commit(setRomCharset(this.state.project, rom), 'history.rom'));
  }

  changeProfile(profileId: string, size?: { width: number; height: number }): boolean {
    this.stop();
    return this.attempt(() =>
      this.commit(changeProfile(this.state.project, profileId, size), 'history.profile', {
        selection: null,
        preview: null,
        cursor: null,
      }),
    );
  }

  // ---------- Opciones del editor ----------

  setTool(tool: ToolId): void {
    this.cancelStroke();
    this.set({ tool, selection: tool === 'select' ? this.state.selection : null });
  }

  setFilled(filled: boolean): void {
    this.set({ filled });
  }

  setSymmetry(symmetry: Symmetry): void {
    this.set({ symmetry });
  }

  setOnion(onion: Partial<OnionSettings>): void {
    const o = { ...this.state.onion, ...onion };
    this.set({
      onion: {
        enabled: o.enabled,
        before: Math.min(5, Math.max(0, Math.round(o.before) || 0)),
        after: Math.min(5, Math.max(0, Math.round(o.after) || 0)),
        opacity: Math.min(90, Math.max(10, Math.round(o.opacity) || 45)),
      },
    });
  }

  setText(text: Partial<TextSettings>): void {
    const t = { ...this.state.text, ...text };
    this.set({
      text: {
        value: Array.from(t.value).slice(0, LIMITS.textToolMaxLength).join(''),
        scale: Math.min(LIMITS.textToolMaxScale, Math.max(1, Math.round(t.scale) || 1)),
        advance: t.advance === 5 ? 5 : 6,
      },
    });
  }

  setTransformAll(all: boolean): void {
    this.set({ transformAll: all });
  }

  setWrapShift(wrap: boolean): void {
    this.set({ wrapShift: wrap });
  }

  setHover(point: Point | null): void {
    const h = this.state.hover;
    if (h === point || (h && point && h.x === point.x && h.y === point.y)) return;
    this.set({ hover: point });
  }

  // ---------- Fotogramas ----------

  selectFrame(index: number): void {
    const i = Math.min(Math.max(0, index), this.state.project.frames.length - 1);
    if (i === this.state.current) return;
    this.cancelStroke();
    this.set({ current: i, selection: null });
  }

  newFrame(): void {
    const { project, current } = this.state;
    this.attempt(() =>
      this.commit(
        insertBlankFrame(project, current + 1, this.currentFrame.durationMs),
        'history.newFrame',
        {
          current: current + 1,
        },
      ),
    );
  }

  duplicateFrame(): void {
    const { project, current } = this.state;
    this.attempt(() =>
      this.commit(duplicateFrame(project, current), 'history.duplicateFrame', {
        current: current + 1,
      }),
    );
  }

  deleteFrame(): void {
    const { project, current } = this.state;
    this.attempt(() =>
      this.commit(deleteFrame(project, current), 'history.deleteFrame', {
        current: Math.min(current, project.frames.length - 2),
      }),
    );
  }

  moveFrame(from: number, to: number): void {
    const target = Math.min(Math.max(0, to), this.state.project.frames.length - 1);
    if (from === target) return;
    this.attempt(() =>
      this.commit(moveFrame(this.state.project, from, target), 'history.moveFrame', {
        current: target,
      }),
    );
  }

  setDuration(ms: number): void {
    this.attempt(() =>
      this.commit(setFrameDuration(this.state.project, this.state.current, ms), 'history.duration'),
    );
  }

  setAllDurations(ms: number): void {
    this.attempt(() => this.commit(setAllDurations(this.state.project, ms), 'history.durationAll'));
  }

  // ---------- Reproducción ----------

  play(): void {
    if (this.state.playing || this.state.project.frames.length < 2) return;
    this.cancelStroke();
    this.playState = { index: this.state.current, direction: 1 };
    this.set({ playing: true, selection: null });
    this.scheduleNext();
  }

  private scheduleNext(): void {
    const frame = this.state.project.frames[this.state.current]!;
    this.playTimer = this.scheduler.setTimeout(() => {
      const step = nextPlaybackStep(
        this.playState,
        this.state.project.frames.length,
        this.state.project.loopMode,
      );
      this.playState = step;
      this.set({ current: step.index });
      if (step.finished) this.stop();
      else this.scheduleNext();
    }, frame.durationMs);
  }

  stop(): void {
    if (this.playTimer !== null) this.scheduler.clearTimeout(this.playTimer);
    this.playTimer = null;
    if (this.state.playing) this.set({ playing: false });
  }

  togglePlay(): void {
    if (this.state.playing) this.stop();
    else this.play();
  }

  // ---------- Dibujo con puntero ----------

  get live(): LiveBuffer | null {
    return this.stroke
      ? { pixels: this.stroke.surface.pixels, dirty: this.stroke.surface.dirty }
      : null;
  }

  /** Empieza una operación en (x, y). `erase` = botón derecho. */
  pointerDown(point: Point, options: { erase?: boolean; copy?: boolean } = {}): void {
    if (this.state.preview) return;
    this.stop();
    const { project, tool, symmetry, selection } = this.state;
    const inside =
      point.x >= 0 && point.y >= 0 && point.x < project.width && point.y < project.height;
    const value: 0 | 1 = tool === 'eraser' || options.erase ? 0 : 1;
    const base = this.currentFrame.pixels;

    if (tool === 'fill') {
      if (!inside) return;
      const pixels = base.slice();
      if (floodFill(pixels, project.width, project.height, point.x, point.y, value) > 0) {
        this.commitPixels(pixels, 'history.fill');
      }
      return;
    }
    if (tool === 'text') {
      if (!inside) return;
      this.stampText(point, value);
      return;
    }
    const clamped = this.clampPoint(point);
    const surface = new DrawSurface(project.width, project.height, base.slice(), symmetry);
    if (tool === 'select') {
      if (selection && rectContains(selection, clamped)) {
        this.stroke = {
          tool,
          value,
          base,
          surface,
          start: clamped,
          last: clamped,
          moveRect: selection,
          copy: options.copy === true,
        };
      } else {
        this.stroke = {
          tool,
          value,
          base,
          surface,
          start: clamped,
          last: clamped,
          selecting: true,
        };
        this.set({ selection: { x: clamped.x, y: clamped.y, width: 1, height: 1 } });
      }
      return;
    }
    this.stroke = { tool, value, base, surface, start: clamped, last: clamped };
    if (tool === 'pencil' || tool === 'eraser') {
      surface.plot(clamped.x, clamped.y, value);
      this.emitLive(this.live);
    }
  }

  pointerMove(point: Point, options: { constrain?: boolean } = {}): void {
    const s = this.stroke;
    if (!s) return;
    const p = this.clampPoint(point);
    const { filled } = this.state;
    switch (s.tool) {
      case 'pencil':
      case 'eraser':
        s.surface.line(s.last.x, s.last.y, p.x, p.y, s.value);
        break;
      case 'line': {
        const end = options.constrain ? constrainEnd(s.start, p, 'line') : p;
        s.surface.restore(s.base);
        s.surface.line(s.start.x, s.start.y, end.x, end.y, s.value);
        break;
      }
      case 'rect':
      case 'ellipse': {
        const end = options.constrain ? constrainEnd(s.start, p, 'box') : p;
        s.surface.restore(s.base);
        if (s.tool === 'rect') s.surface.rect(s.start.x, s.start.y, end.x, end.y, filled, s.value);
        else s.surface.ellipse(s.start.x, s.start.y, end.x, end.y, filled, s.value);
        break;
      }
      case 'select': {
        if (s.selecting) {
          this.set({ selection: rectFromPoints(s.start, p) });
          s.last = p;
          return;
        }
        if (s.moveRect) {
          const dx = p.x - s.start.x;
          const dy = p.y - s.start.y;
          const moved = moveRegion(
            s.base,
            this.state.project.width,
            this.state.project.height,
            s.moveRect,
            dx,
            dy,
            s.copy === true,
          );
          s.surface.pixels.set(moved);
          s.surface.dirty = {
            x0: 0,
            y0: 0,
            x1: this.state.project.width - 1,
            y1: this.state.project.height - 1,
          };
          this.set({ selection: { ...s.moveRect, x: s.moveRect.x + dx, y: s.moveRect.y + dy } });
        }
        break;
      }
      default:
        break;
    }
    s.last = p;
    this.emitLive(this.live);
  }

  pointerUp(): void {
    const s = this.stroke;
    if (!s) return;
    this.stroke = null;
    this.emitLive(null);
    if (s.tool === 'select') {
      if (s.selecting) {
        const sel = this.state.selection;
        if (
          sel &&
          sel.width === 1 &&
          sel.height === 1 &&
          s.start.x === s.last.x &&
          s.start.y === s.last.y
        ) {
          this.set({ selection: null });
        }
        return;
      }
      if (s.moveRect && (s.last.x !== s.start.x || s.last.y !== s.start.y)) {
        this.commitPixels(s.surface.pixels, s.copy ? 'history.copyMove' : 'history.move', {
          selection: this.state.selection,
        });
      } else if (s.moveRect) {
        this.set({ selection: s.moveRect });
      }
      return;
    }
    const label: Record<string, string> = {
      pencil: 'history.draw',
      eraser: 'history.erase',
      line: 'history.line',
      rect: 'history.rect',
      ellipse: 'history.ellipse',
    };
    this.commitPixels(s.surface.pixels, label[s.tool] ?? 'history.draw');
  }

  cancelStroke(): void {
    if (this.stroke) {
      this.stroke = null;
      this.emitLive(null);
    }
  }

  private clampPoint(p: Point): Point {
    const { width, height } = this.state.project;
    return {
      x: Math.min(width - 1, Math.max(0, Math.round(p.x))),
      y: Math.min(height - 1, Math.max(0, Math.round(p.y))),
    };
  }

  private commitPixels(pixels: Uint8Array, label: string, extra: Partial<EditorState> = {}): void {
    const frame = this.currentFrame;
    if (pixels.length === frame.pixels.length && pixels.every((v, i) => v === frame.pixels[i])) {
      if (extra.selection !== undefined) this.set({ selection: extra.selection });
      return;
    }
    this.attempt(() =>
      this.commit(replaceFramePixels(this.state.project, this.state.current, pixels), label, extra),
    );
  }

  private stampText(point: Point, value: 0 | 1): void {
    const { project, text, symmetry } = this.state;
    const bad = unsupportedTextChars(text.value);
    if (bad.length > 0) {
      this.emit({ type: 'error', code: 'draw.textUnsupported', params: { chars: bad.join(' ') } });
      return;
    }
    if (!text.value) return;
    let { x, y } = point;
    if (getProfile(project.profileId)?.kind === 'character') {
      x = Math.floor(x / 5) * 5;
      y = Math.floor(y / 8) * 8;
    }
    const surface = new DrawSurface(
      project.width,
      project.height,
      this.currentFrame.pixels.slice(),
      symmetry,
    );
    drawText(surface, x, y, text.value, { scale: text.scale, advance: text.advance }, value);
    this.commitPixels(surface.pixels, 'history.text');
  }

  // ---------- Teclado sobre el lienzo ----------

  moveCursor(dx: number, dy: number): void {
    const { width, height } = this.state.project;
    const c = this.state.cursor ?? { x: 0, y: 0 };
    this.set({
      cursor: {
        x: Math.min(width - 1, Math.max(0, c.x + dx)),
        y: Math.min(height - 1, Math.max(0, c.y + dy)),
      },
    });
  }

  setCursor(point: Point | null): void {
    this.set({ cursor: point ? this.clampPoint(point) : null });
  }

  /** Cambia (o fija) el píxel bajo el cursor de teclado. */
  cursorPixel(mode: 'toggle' | 'off'): void {
    const c = this.state.cursor;
    if (!c || this.state.preview) return;
    const { width, height } = this.state.project;
    const pixels = this.currentFrame.pixels.slice();
    const current = pixels[c.y * width + c.x] ? 1 : 0;
    const value: 0 | 1 = mode === 'off' ? 0 : current ? 0 : 1;
    const surface = new DrawSurface(width, height, pixels, this.state.symmetry);
    surface.plot(c.x, c.y, value);
    this.commitPixels(surface.pixels, 'history.pixel');
  }

  // ---------- Selección y portapapeles ----------

  selectAll(): void {
    const { width, height } = this.state.project;
    this.set({ tool: 'select', selection: { x: 0, y: 0, width, height } });
  }

  deselect(): void {
    if (this.state.selection) this.set({ selection: null });
  }

  copy(): boolean {
    const sel = this.state.selection;
    if (!sel) return false;
    const { width, height } = this.state.project;
    this.set({ clipboard: extractRegion(this.currentFrame.pixels, width, height, sel) });
    return true;
  }

  cut(): boolean {
    const sel = this.state.selection;
    if (!sel || !this.copy()) return false;
    const { width, height } = this.state.project;
    const pixels = this.currentFrame.pixels.slice();
    fillRegion(pixels, width, height, sel, 0);
    this.commitPixels(pixels, 'history.cut', { selection: sel });
    return true;
  }

  paste(): boolean {
    const clip = this.state.clipboard;
    if (!clip) return false;
    const sel = this.state.selection;
    const x = sel?.x ?? 0;
    const y = sel?.y ?? 0;
    const { width, height } = this.state.project;
    const pixels = this.currentFrame.pixels.slice();
    stampClip(pixels, width, height, clip, x, y);
    const rect = { x, y, width: clip.width, height: clip.height };
    this.set({ tool: 'select' });
    this.commitPixels(pixels, 'history.paste', { selection: rect });
    if (!this.state.selection) this.set({ selection: rect });
    return true;
  }

  deleteSelection(): boolean {
    const sel = this.state.selection;
    if (!sel) return false;
    const { width, height } = this.state.project;
    const pixels = this.currentFrame.pixels.slice();
    fillRegion(pixels, width, height, sel, 0);
    this.commitPixels(pixels, 'history.delete', { selection: sel });
    return true;
  }

  /** Mueve la selección un paso con su contenido. */
  nudgeSelection(dx: number, dy: number): boolean {
    const sel = this.state.selection;
    if (!sel) return false;
    const { width, height } = this.state.project;
    const moved = moveRegion(this.currentFrame.pixels, width, height, sel, dx, dy, false);
    const next = { ...sel, x: sel.x + dx, y: sel.y + dy };
    if (!clipRect(next, width, height)) return false;
    this.commitPixels(moved, 'history.move', { selection: next });
    if (this.state.selection !== next) this.set({ selection: next });
    return true;
  }

  // ---------- Transformaciones ----------

  private transform(
    fn: (pixels: Uint8Array, w: number, h: number) => Uint8Array,
    label: string,
  ): void {
    const { project, current, transformAll } = this.state;
    const indices = transformAll ? project.frames.map((_, i) => i) : [current];
    const changes = new Map<number, Uint8Array>();
    for (const i of indices)
      changes.set(i, fn(project.frames[i]!.pixels, project.width, project.height));
    this.attempt(() => this.commit(replaceManyPixels(project, changes), label));
  }

  invert(): void {
    this.transform((p) => invertPixels(p), 'history.invert');
  }

  clear(): void {
    this.transform((p) => clearPixels(p), 'history.clear');
  }

  flipH(): void {
    this.transform(flipHorizontal, 'history.flipH');
  }

  flipV(): void {
    this.transform(flipVertical, 'history.flipV');
  }

  shift(dx: number, dy: number): void {
    const wrap = this.state.wrapShift;
    this.transform((p, w, h) => shiftPixels(p, w, h, dx, dy, wrap), 'history.shift');
  }

  // ---------- Vista previa de imagen ----------

  setPreview(pixels: Uint8Array | null, mode: 'replace' | 'or' = this.state.previewMode): void {
    if (pixels && pixels.length !== this.state.project.width * this.state.project.height) {
      throw new AppError('project.invalidFramePixels');
    }
    this.cancelStroke();
    this.set({ preview: pixels, previewMode: mode });
  }

  /** Píxeles que se ven en el lienzo (vista previa combinada si existe). */
  displayPixels(): Uint8Array {
    const { preview, previewMode } = this.state;
    const base = this.currentFrame.pixels;
    if (!preview) return base;
    if (previewMode === 'replace') return preview;
    const out = base.slice();
    for (let i = 0; i < out.length; i++) if (preview[i]) out[i] = 1;
    return out;
  }

  applyPreview(asNewFrame: boolean): void {
    const preview = this.state.preview;
    if (!preview) return;
    const pixels = this.displayPixels();
    if (asNewFrame) {
      const { project, current } = this.state;
      this.attempt(() =>
        this.commit(
          insertFrames(project, current + 1, [createFrame(pixels, this.currentFrame.durationMs)]),
          'history.imageNew',
          {
            current: current + 1,
            preview: null,
          },
        ),
      );
      return;
    }
    this.attempt(() =>
      this.commit(
        replaceFramePixels(this.state.project, this.state.current, pixels),
        'history.image',
        { preview: null },
      ),
    );
  }

  /** Importa una secuencia completa (GIF) como fotogramas. */
  importSequence(
    frames: readonly { pixels: Uint8Array; durationMs: number }[],
    replace: boolean,
  ): boolean {
    const { project } = this.state;
    return this.attempt(() => {
      const created = frames.map((f) => createFrame(f.pixels, f.durationMs));
      const next = replace
        ? replaceAllFrames(project, created)
        : insertFrames(project, project.frames.length, created);
      this.commit(next, 'history.sequence', {
        current: replace ? 0 : project.frames.length,
        preview: null,
      });
    });
  }

  dispose(): void {
    this.stop();
    this.listeners.clear();
    this.liveListeners.clear();
    this.eventListeners.clear();
  }
}
