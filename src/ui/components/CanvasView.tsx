import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { resolveColors } from '../../core/appearance.ts';
import type { DirtyRect } from '../../engine/draw.ts';
import { useEditor, usePreferences, useServices } from '../app-context.tsx';
import { computeLayout, screenToPixel } from '../canvas/layout.ts';
import { LcdRenderer, type OnionLayer } from '../canvas/renderer.ts';
import { useCharAnalysis, useProfile } from '../hooks.ts';
import { useI18n } from '../i18n/index.tsx';

/**
 * Lienzo editable. El dibujo se hace sobre un búfer de trabajo del almacén y
 * solo se vuelve a componer en el siguiente cuadro de animación; el teclado
 * permite editar sin ratón (flechas, Espacio/Intro, Supr).
 */
export function CanvasView({ zoom }: { zoom: number }) {
  const { store } = useServices();
  const { tk } = useI18n();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rendererRef = useRef<LcdRenderer | null>(null);
  const liveDirty = useRef<DirtyRect | null>(null);
  const frameRequest = useRef(0);
  const descriptionId = useId();
  const [announcement, setAnnouncement] = useState('');

  const profile = useProfile();
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.current);
  const preview = useEditor((s) => s.preview);
  const previewMode = useEditor((s) => s.previewMode);
  const selection = useEditor((s) => s.selection);
  const cursor = useEditor((s) => s.cursor);
  const onion = useEditor((s) => s.onion);
  const playing = useEditor((s) => s.playing);
  const tool = useEditor((s) => s.tool);
  const prefs = usePreferences();
  const analysis = useCharAnalysis();

  const layout = useMemo(
    () => computeLayout(project.width, project.height, profile, zoom),
    [project.width, project.height, profile, zoom],
  );
  const colors = useMemo(() => resolveColors(project.appearance), [project.appearance]);
  const frame = project.frames[current]!;
  const litCount = useMemo(() => frame.pixels.reduce((n, v) => n + (v ? 1 : 0), 0), [frame.pixels]);

  const onionLayers = useMemo<OnionLayer[]>(() => {
    if (!onion.enabled || playing) return [];
    const n = project.frames.length;
    const layers: OnionLayer[] = [];
    for (let k = onion.before; k >= 1; k--) {
      const i = current - k;
      if (i >= 0)
        layers.push({
          pixels: project.frames[i]!.pixels,
          relation: 'before',
          alpha: onion.opacity / 100 / k,
        });
    }
    for (let k = onion.after; k >= 1; k--) {
      const i = current + k;
      if (i < n)
        layers.push({
          pixels: project.frames[i]!.pixels,
          relation: 'after',
          alpha: onion.opacity / 100 / k,
        });
    }
    return layers;
  }, [onion, playing, project.frames, current]);

  const overflow = useMemo(
    () => (prefs.markCells && analysis && !preview ? analysis.overflow : []),
    [prefs.markCells, analysis, preview],
  );

  useEffect(() => {
    if (!canvasRef.current) return undefined;
    const renderer = new LcdRenderer(canvasRef.current);
    rendererRef.current = renderer;
    return () => {
      renderer.dispose();
      rendererRef.current = null;
    };
  }, []);

  // Composición: se agrupan los cambios en un único cuadro de animación.
  useEffect(() => {
    const draw = () => {
      frameRequest.current = 0;
      const live = store.live;
      const pixels = live?.pixels ?? store.displayPixels();
      rendererRef.current?.render(
        {
          layout,
          pixels,
          colors,
          grid: prefs.grid,
          onion: onionLayers,
          selection,
          overflow,
          cursor,
          devicePixelRatio: window.devicePixelRatio || 1,
        },
        live ? liveDirty.current : null,
      );
      liveDirty.current = null;
    };
    const schedule = () => {
      if (!frameRequest.current) frameRequest.current = requestAnimationFrame(draw);
    };
    // El redibujado completo va en el siguiente cuadro, fuera del commit de React.
    schedule();
    const unsubscribe = store.subscribeLive((live) => {
      if (live?.dirty) {
        const d = liveDirty.current;
        liveDirty.current = d
          ? {
              x0: Math.min(d.x0, live.dirty.x0),
              y0: Math.min(d.y0, live.dirty.y0),
              x1: Math.max(d.x1, live.dirty.x1),
              y1: Math.max(d.y1, live.dirty.y1),
            }
          : { ...live.dirty };
      }
      schedule();
    });
    return () => {
      unsubscribe();
      if (frameRequest.current) cancelAnimationFrame(frameRequest.current);
      frameRequest.current = 0;
    };
  }, [
    store,
    layout,
    colors,
    prefs.grid,
    onionLayers,
    selection,
    overflow,
    cursor,
    frame,
    preview,
    previewMode,
  ]);

  const toPixel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const sx = ((event.clientX - rect.left) * layout.width) / rect.width;
    const sy = ((event.clientY - rect.top) * layout.height) / rect.height;
    return screenToPixel(layout, sx, sy);
  };

  return (
    <>
      <canvas
        ref={canvasRef}
        className="lcd-canvas"
        data-testid="lcd-canvas"
        data-tool={tool}
        data-zoom={layout.zoom}
        data-pad={layout.pad}
        data-gap-x={layout.gapX}
        data-gap-y={layout.gapY}
        tabIndex={0}
        role="application"
        aria-label={tk('canvas.label', {
          width: project.width,
          height: project.height,
          frame: current + 1,
          frames: project.frames.length,
        })}
        aria-describedby={descriptionId}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={(e) => {
          if (e.button !== 0 && e.button !== 2) return;
          e.currentTarget.setPointerCapture(e.pointerId);
          const p = toPixel(e);
          store.pointerDown(p, { erase: e.button === 2, copy: e.ctrlKey || e.metaKey });
        }}
        onPointerMove={(e) => {
          const p = toPixel(e);
          store.setHover(p.inside ? { x: p.x, y: p.y } : null);
          store.pointerMove(p, { constrain: e.shiftKey });
        }}
        onPointerUp={() => store.pointerUp()}
        onPointerCancel={() => store.cancelStroke()}
        onPointerLeave={() => store.setHover(null)}
        onFocus={() => {
          if (!store.getState().cursor) store.setCursor({ x: 0, y: 0 });
        }}
        onKeyDown={(e) => {
          const moves: Record<string, [number, number]> = {
            ArrowLeft: [-1, 0],
            ArrowRight: [1, 0],
            ArrowUp: [0, -1],
            ArrowDown: [0, 1],
          };
          const move = moves[e.key];
          let handled = true;
          if (move && !e.altKey && !e.ctrlKey && !e.metaKey) {
            const step = e.shiftKey ? (profile.kind === 'character' ? 5 : 8) : 1;
            store.moveCursor(move[0] * step, move[1] * step);
          } else if (e.key === ' ' || e.key === 'Enter') {
            store.cursorPixel('toggle');
          } else if (e.key === 'Delete' || e.key === 'Backspace') {
            store.cursorPixel('off');
          } else if (e.key === 'Escape') {
            store.setCursor(null);
          } else {
            handled = false;
          }
          if (handled) {
            e.preventDefault();
            e.stopPropagation();
            const c = store.getState().cursor;
            if (c) {
              const on = store.currentFrame.pixels[c.y * project.width + c.x];
              setAnnouncement(
                tk('canvas.cursor', {
                  x: c.x,
                  y: c.y,
                  state: tk(on ? 'canvas.pixelOn' : 'canvas.pixelOff'),
                }),
              );
            }
          }
        }}
      />
      <p id={descriptionId} className="visually-hidden">
        {tk('canvas.description', { lit: litCount })}
      </p>
      <p className="visually-hidden" aria-live="polite">
        {announcement}
      </p>
    </>
  );
}
