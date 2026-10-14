import { memo, useEffect, useId, useRef, useState } from 'react';
import { hexToRgb, resolveColors, type LcdColors } from '../../core/appearance.ts';
import { LIMITS } from '../../core/limits.ts';
import { LOOP_MODES, type LoopMode } from '../../core/project.ts';
import { useEditor, useServices } from '../app-context.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { thumbnailQueue } from '../canvas/idle-queue.ts';
import { PixelIcon } from './PixelIcon.tsx';

/** Miniatura: solo se redibuja si cambia su arreglo de píxeles o los colores. */
const FrameThumb = memo(function FrameThumb(props: {
  pixels: Uint8Array;
  width: number;
  height: number;
  colors: LcdColors;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const { pixels, width, height, colors } = props;
  // La miniatura se dibuja a su tamaño final (máx. 150 × 52): coste fijo por
  // fotograma aunque el lienzo sea de 512 × 512.
  const k = Math.min(1, 150 / width, 52 / height);
  const tw = Math.max(1, Math.round(width * k));
  const th = Math.max(1, Math.round(height * k));
  useEffect(
    () =>
      thumbnailQueue.add(() => {
        const canvas = ref.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        const img = new ImageData(tw, th);
        const on = hexToRgb(colors.on);
        const off = hexToRgb(colors.off);
        for (let y = 0; y < th; y++) {
          const sy = Math.floor((y * height) / th);
          for (let x = 0; x < tw; x++) {
            const c = pixels[sy * width + Math.floor((x * width) / tw)] ? on : off;
            const p = (y * tw + x) * 4;
            img.data[p] = c[0];
            img.data[p + 1] = c[1];
            img.data[p + 2] = c[2];
            img.data[p + 3] = 255;
          }
        }
        ctx.putImageData(img, 0, 0);
      }),
    [pixels, width, height, colors, tw, th],
  );
  return <canvas ref={ref} width={tw} height={th} aria-hidden="true" />;
});

export function Timeline() {
  const { tk } = useI18n();
  const { store } = useServices();
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.current);
  const playing = useEditor((s) => s.playing);
  const onion = useEditor((s) => s.onion);
  const ids = useId();
  const colors = resolveColors(project.appearance);
  const frame = project.frames[current]!;
  const [duration, setDuration] = useState(String(frame.durationMs));
  const [drag, setDrag] = useState<{ from: number; over: number; side: 'before' | 'after' } | null>(
    null,
  );
  const items = useRef<(HTMLLIElement | null)[]>([]);

  const [durationSource, setDurationSource] = useState(frame);
  if (durationSource !== frame) {
    setDurationSource(frame);
    setDuration(String(frame.durationMs));
  }
  useEffect(() => {
    items.current[current]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }, [current]);

  const durationNumber = Number(duration);
  const durationValid =
    Number.isInteger(durationNumber) &&
    durationNumber >= LIMITS.frameDurationMinMs &&
    durationNumber <= LIMITS.frameDurationMaxMs;

  const commitDuration = () => {
    if (durationValid && durationNumber !== frame.durationMs) store.setDuration(durationNumber);
  };

  const focusFrame = (i: number) => {
    store.selectFrame(i);
    requestAnimationFrame(() => items.current[Math.min(i, project.frames.length - 1)]?.focus());
  };

  const onionLabel = (i: number): string | null => {
    if (!onion.enabled || i === current) return null;
    const d = i - current;
    if (d < 0 && -d <= onion.before) return `−${-d}`;
    if (d > 0 && d <= onion.after) return `+${d}`;
    return null;
  };

  return (
    <footer className="timeline raised" aria-label={tk('timeline.label')}>
      <div className="panel-title" id={`${ids}-title`}>
        {tk('timeline.frames')} —{' '}
        {tk('timeline.count', { frames: project.frames.length, max: LIMITS.maxFrames })}
      </div>
      <ul
        className="frame-strip sunken"
        role="listbox"
        aria-labelledby={`${ids}-title`}
        aria-orientation="horizontal"
        aria-describedby={`${ids}-hint`}
        data-testid="frame-strip"
      >
        {project.frames.map((f, i) => {
          const mark = onionLabel(i);
          return (
            <li
              key={f.id}
              ref={(el) => {
                items.current[i] = el;
              }}
              role="option"
              aria-selected={i === current}
              tabIndex={i === current ? 0 : -1}
              className="frame-item"
              data-testid="frame-item"
              data-drop={drag && drag.over === i && drag.from !== i ? drag.side : undefined}
              aria-label={tk(i === current ? 'timeline.frameSelected' : 'timeline.frame', {
                frame: i + 1,
                duration: f.durationMs,
              })}
              draggable
              onClick={() => {
                store.stop();
                store.selectFrame(i);
              }}
              onKeyDown={(e) => {
                const last = project.frames.length - 1;
                if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
                  const to = e.key === 'ArrowLeft' ? i - 1 : i + 1;
                  if (to >= 0 && to <= last) {
                    store.moveFrame(i, to);
                    requestAnimationFrame(() => items.current[to]?.focus());
                  }
                } else if (e.key === 'ArrowLeft') focusFrame(Math.max(0, i - 1));
                else if (e.key === 'ArrowRight') focusFrame(Math.min(last, i + 1));
                else if (e.key === 'Home') focusFrame(0);
                else if (e.key === 'End') focusFrame(last);
                else return;
                e.preventDefault();
                e.stopPropagation();
              }}
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', String(i));
                setDrag({ from: i, over: i, side: 'before' });
              }}
              onDragOver={(e) => {
                if (!drag) return;
                e.preventDefault();
                const rect = e.currentTarget.getBoundingClientRect();
                const side = e.clientX < rect.left + rect.width / 2 ? 'before' : 'after';
                if (drag.over !== i || drag.side !== side) setDrag({ ...drag, over: i, side });
              }}
              onDrop={(e) => {
                e.preventDefault();
                if (!drag) return;
                let to = drag.side === 'before' ? i : i + 1;
                if (drag.from < to) to -= 1;
                store.moveFrame(drag.from, to);
                setDrag(null);
              }}
              onDragEnd={() => setDrag(null)}
            >
              <div>
                {i + 1}
                {mark ? <span className="onion-mark"> {mark}</span> : null}
              </div>
              <FrameThumb
                pixels={f.pixels}
                width={project.width}
                height={project.height}
                colors={colors}
              />
              <div>{f.durationMs} ms</div>
            </li>
          );
        })}
      </ul>
      <p id={`${ids}-hint`} className="visually-hidden">
        {tk('timeline.reorderHint')}
      </p>
      <div className="timeline-bar">
        <button
          type="button"
          className="btn primary"
          data-testid="play"
          onClick={() => store.togglePlay()}
          disabled={project.frames.length < 2 && !playing}
        >
          <PixelIcon name={playing ? 'stop' : 'play'} />
          {tk(playing ? 'timeline.stop' : 'timeline.play')}
        </button>
        <label className="visually-hidden" htmlFor={`${ids}-loop`}>
          {tk('project.loop')}
        </label>
        <select
          id={`${ids}-loop`}
          className="field"
          value={project.loopMode}
          onChange={(e) => store.setLoopMode(e.target.value as LoopMode)}
        >
          {LOOP_MODES.map((m) => (
            <option key={m} value={m}>
              {tk(`loop.${m}` as MessageKey)}
            </option>
          ))}
        </select>
        <span className="toolbar-sep" aria-hidden="true" />
        <button
          type="button"
          className="btn"
          data-testid="frame-new"
          onClick={() => store.newFrame()}
          title={tk('timeline.new.tip')}
          disabled={project.frames.length >= LIMITS.maxFrames}
        >
          <PixelIcon name="new" />
          {tk('timeline.new')}
        </button>
        <button
          type="button"
          className="btn"
          data-testid="frame-duplicate"
          onClick={() => store.duplicateFrame()}
          disabled={project.frames.length >= LIMITS.maxFrames}
        >
          <PixelIcon name="duplicate" />
          {tk('timeline.duplicate')}
        </button>
        <button
          type="button"
          className="btn"
          data-testid="frame-delete"
          onClick={() => store.deleteFrame()}
          disabled={project.frames.length <= 1}
          title={project.frames.length <= 1 ? tk('timeline.delete.last') : undefined}
        >
          <PixelIcon name="delete" />
          {tk('timeline.delete')}
        </button>
        <button
          type="button"
          className="btn icon-only"
          onClick={() => store.moveFrame(current, current - 1)}
          disabled={current === 0}
          aria-label={tk('timeline.moveLeft')}
        >
          <PixelIcon name="left" />
        </button>
        <button
          type="button"
          className="btn icon-only"
          onClick={() => store.moveFrame(current, current + 1)}
          disabled={current >= project.frames.length - 1}
          aria-label={tk('timeline.moveRight')}
        >
          <PixelIcon name="right" />
        </button>
        <span className="toolbar-sep" aria-hidden="true" />
        <label htmlFor={`${ids}-duration`}>{tk('timeline.duration')}</label>
        <input
          id={`${ids}-duration`}
          className="field"
          type="number"
          inputMode="numeric"
          min={LIMITS.frameDurationMinMs}
          max={LIMITS.frameDurationMaxMs}
          step={10}
          value={duration}
          aria-invalid={!durationValid}
          aria-describedby={durationValid ? undefined : `${ids}-duration-error`}
          data-testid="frame-duration"
          onChange={(e) => setDuration(e.target.value)}
          onBlur={commitDuration}
          onKeyDown={(e) => e.key === 'Enter' && commitDuration()}
        />
        <button
          type="button"
          className="btn"
          onClick={() => durationValid && store.setAllDurations(durationNumber)}
          disabled={!durationValid}
          title={tk('timeline.durationAll.tip')}
        >
          {tk('timeline.durationAll')}
        </button>
        {!durationValid ? (
          <span id={`${ids}-duration-error`} className="error-text" role="alert">
            {tk('project.invalidDuration', {
              value: duration,
              min: LIMITS.frameDurationMinMs,
              max: LIMITS.frameDurationMaxMs,
            })}
          </span>
        ) : null}
        <span className="toolbar-sep" aria-hidden="true" />
        <label className="check">
          <input
            type="checkbox"
            checked={onion.enabled}
            data-testid="onion"
            onChange={(e) => store.setOnion({ enabled: e.target.checked })}
          />
          <PixelIcon name="onion" />
          {tk('timeline.onion')}
        </label>
        {onion.enabled ? (
          <>
            <label htmlFor={`${ids}-before`}>{tk('timeline.onionBefore')}</label>
            <input
              id={`${ids}-before`}
              className="field narrow"
              type="number"
              min={0}
              max={5}
              value={onion.before}
              onChange={(e) => store.setOnion({ before: e.target.valueAsNumber })}
            />
            <label htmlFor={`${ids}-after`}>{tk('timeline.onionAfter')}</label>
            <input
              id={`${ids}-after`}
              className="field narrow"
              type="number"
              min={0}
              max={5}
              value={onion.after}
              onChange={(e) => store.setOnion({ after: e.target.valueAsNumber })}
            />
            <label htmlFor={`${ids}-opacity`}>{tk('timeline.onionOpacity')}</label>
            <input
              id={`${ids}-opacity`}
              type="range"
              min={10}
              max={90}
              value={onion.opacity}
              onChange={(e) => store.setOnion({ opacity: Number(e.target.value) })}
            />
          </>
        ) : null}
      </div>
    </footer>
  );
}
