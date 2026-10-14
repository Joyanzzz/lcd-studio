import { useEffect, useRef, useState } from 'react';
import { LIMITS } from '../../core/limits.ts';
import { useEditor, usePreferences, useServices } from '../app-context.tsx';
import { fitZoom, maxZoomFor } from '../canvas/layout.ts';
import { useCharAnalysis, useProfile } from '../hooks.ts';
import { useI18n } from '../i18n/index.tsx';
import { CanvasView } from './CanvasView.tsx';
import { PixelIcon } from './PixelIcon.tsx';

export function Stage() {
  const { tk } = useI18n();
  const { store, preferences } = useServices();
  const prefs = usePreferences();
  const profile = useProfile();
  const width = useEditor((s) => s.project.width);
  const height = useEditor((s) => s.project.height);
  const symmetry = useEditor((s) => s.symmetry);
  const preview = useEditor((s) => s.preview);
  const [zoom, setZoom] = useState(8);
  const [autoFit, setAutoFit] = useState(true);
  const wrap = useRef<HTMLDivElement>(null);
  const dpr = typeof window === 'undefined' ? 1 : window.devicePixelRatio || 1;
  const maxZoom = maxZoomFor(width, height, profile, dpr);

  useEffect(() => {
    if (!autoFit || !wrap.current) return undefined;
    const el = wrap.current;
    const update = () =>
      setZoom(
        fitZoom(
          width,
          height,
          profile,
          el.clientWidth - 24,
          el.clientHeight - 24,
          window.devicePixelRatio || 1,
        ),
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [autoFit, width, height, profile]);

  const changeZoom = (z: number) => {
    setAutoFit(false);
    setZoom(Math.min(maxZoom, Math.max(LIMITS.zoomMin, z)));
  };

  return (
    <section className="stage sunken" aria-label={tk('view.label')} id="editor">
      <div className="viewbar" role="toolbar" aria-label={tk('view.label')}>
        <button
          type="button"
          className="btn icon-only"
          onClick={() => changeZoom(zoom - 1)}
          aria-label={tk('view.zoomOut')}
        >
          <PixelIcon name="zoomOut" />
        </button>
        <label className="visually-hidden" htmlFor="zoom-range">
          {tk('view.zoom')}
        </label>
        <input
          id="zoom-range"
          type="range"
          min={LIMITS.zoomMin}
          max={maxZoom}
          value={Math.min(zoom, maxZoom)}
          onChange={(e) => changeZoom(Number(e.target.value))}
          aria-valuetext={tk('view.zoomValue', { zoom })}
        />
        <button
          type="button"
          className="btn icon-only"
          onClick={() => changeZoom(zoom + 1)}
          aria-label={tk('view.zoomIn')}
        >
          <PixelIcon name="zoomIn" />
        </button>
        <button
          type="button"
          className="btn"
          aria-pressed={autoFit}
          onClick={() => setAutoFit(true)}
          title={tk('view.fit.tip')}
        >
          <PixelIcon name="fit" />
          {tk('view.fit')}
        </button>
        <label className="check">
          <input
            type="checkbox"
            checked={prefs.grid}
            onChange={(e) => preferences.update({ grid: e.target.checked })}
          />
          {tk('view.grid')}
        </label>
        <label className="check" title={tk('view.mirrorH.label')}>
          <input
            type="checkbox"
            checked={symmetry.horizontal}
            onChange={(e) => store.setSymmetry({ ...symmetry, horizontal: e.target.checked })}
            aria-label={tk('view.mirrorH.label')}
          />
          <span aria-hidden="true">{tk('view.mirrorH')}</span>
        </label>
        <label className="check" title={tk('view.mirrorV.label')}>
          <input
            type="checkbox"
            checked={symmetry.vertical}
            onChange={(e) => store.setSymmetry({ ...symmetry, vertical: e.target.checked })}
            aria-label={tk('view.mirrorV.label')}
          />
          <span aria-hidden="true">{tk('view.mirrorV')}</span>
        </label>
        {profile.kind === 'character' ? (
          <label className="check">
            <input
              type="checkbox"
              checked={prefs.markCells}
              onChange={(e) => preferences.update({ markCells: e.target.checked })}
            />
            {tk('view.markCells')}
          </label>
        ) : null}
      </div>
      <div className="canvas-wrap" ref={wrap}>
        <div className="canvas-doc raised">
          <CanvasView zoom={Math.min(zoom, maxZoom)} />
        </div>
        {preview ? (
          <div className="preview-banner" role="region" aria-label={tk('canvas.previewBanner')}>
            <PixelIcon name="image" />
            <span>{tk('canvas.previewBanner')}</span>
            <button type="button" className="btn primary" onClick={() => store.applyPreview(false)}>
              {tk('canvas.apply')}
            </button>
            <button type="button" className="btn" onClick={() => store.setPreview(null)}>
              {tk('canvas.cancel')}
            </button>
          </div>
        ) : null}
      </div>
      <StatusBar />
    </section>
  );
}

function StatusBar() {
  const { tk } = useI18n();
  const profile = useProfile();
  const width = useEditor((s) => s.project.width);
  const height = useEditor((s) => s.project.height);
  const current = useEditor((s) => s.current);
  const frames = useEditor((s) => s.project.frames.length);
  const hover = useEditor((s) => s.hover);
  const selection = useEditor((s) => s.selection);
  const analysis = useCharAnalysis();
  const used = analysis ? Math.min(8, analysis.glyphs.length) : 0;
  return (
    <div className="statusbar" role="group" aria-label={tk('status.label')} data-testid="statusbar">
      <span>
        {profile.kind === 'character'
          ? `${tk('status.charSize', { columns: profile.columns, rows: profile.rows })} · `
          : ''}
        {tk('status.size', { width, height })}
      </span>
      <span>{tk('status.frame', { frame: current + 1, frames })}</span>
      {analysis ? (
        <span
          className={analysis.overflow.length > 0 ? 'error-text' : undefined}
          data-testid="cgram-status"
        >
          {analysis.overflow.length > 0
            ? tk('status.cgramOverflow', {
                used: analysis.glyphs.length,
                cells: analysis.overflow.length,
              })
            : tk('status.cgram', { used })}
        </span>
      ) : null}
      {selection ? (
        <span>{tk('status.selection', { width: selection.width, height: selection.height })}</span>
      ) : null}
      <span>{hover ? tk('status.cursor', { x: hover.x, y: hover.y }) : ''}</span>
    </div>
  );
}
