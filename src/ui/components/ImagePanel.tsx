import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { isAppError } from '../../core/errors.ts';
import { LIMITS } from '../../core/limits.ts';
import { autoLevels } from '../../engine/image/levels.ts';
import {
  DEFAULT_IMAGE_PARAMS,
  DITHER_MODES,
  FIT_MODES,
  ROTATIONS,
  type ImageParams,
} from '../../engine/image/params.ts';
import type { DecodedInfo } from '../../workers/image-protocol.ts';
import { useEditor, useServices } from '../app-context.tsx';
import { useProfile } from '../hooks.ts';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { PixelIcon } from './PixelIcon.tsx';

interface OpenImage {
  readonly name: string;
  readonly info: DecodedInfo;
}

function SliderRow(props: {
  id: string;
  label: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  display?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="slider-row">
      <label htmlFor={props.id}>{props.label}</label>
      <input
        id={props.id}
        type="range"
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        value={props.value}
        onChange={(e) => props.onChange(Number(e.target.value))}
      />
      <output htmlFor={props.id} className="field">
        {props.display ?? props.value}
      </output>
    </div>
  );
}

export function ImagePanel({ onActivate }: { onActivate: () => void }) {
  const { tk, formatNumber } = useI18n();
  const { images, store, toasts } = useServices();
  const profile = useProfile();
  const width = useEditor((s) => s.project.width);
  const height = useEditor((s) => s.project.height);
  const frameCount = useEditor((s) => s.project.frames.length);
  const previewMode = useEditor((s) => s.previewMode);
  const [image, setImage] = useState<OpenImage | null>(null);
  const [loading, setLoading] = useState<number | null>(null);
  const [processing, setProcessing] = useState<number | null>(null);
  const [source, setSource] = useState(0);
  const [params, setParams] = useState<ImageParams>(DEFAULT_IMAGE_PARAMS);
  const [histogram, setHistogram] = useState<Uint32Array | null>(null);
  const [replaceFrames, setReplaceFrames] = useState(true);
  const [over, setOver] = useState(false);
  const request = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const histCanvas = useRef<HTMLCanvasElement>(null);
  const ids = useId();

  const reset = useCallback(() => {
    images.release();
    store.setPreview(null);
    setImage(null);
    setHistogram(null);
    setSource(0);
  }, [images, store]);

  const load = useCallback(
    async (file: File) => {
      onActivate();
      if (file.size > LIMITS.imageMaxCompressedBytes) {
        toasts.push('error', 'image.tooLarge', { max: LIMITS.imageMaxCompressedBytes });
        return;
      }
      setLoading(0);
      try {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const info = await images.decode(bytes, (done, total) =>
          setLoading(Math.round((done / total) * 100)),
        );
        setImage({ name: file.name, info });
        setSource(0);
        setParams({
          ...DEFAULT_IMAGE_PARAMS,
          litFrom: profile.kind === 'graphic' ? 'light' : 'dark',
        });
        toasts.push('success', 'toast.imageLoaded', { name: file.name });
        if (info.animatedWebp) toasts.push('warning', 'image.animatedWebp');
      } catch (error) {
        if (isAppError(error) && error.code === 'task.cancelled')
          toasts.push('info', 'toast.cancelled');
        else {
          toasts.push('error', 'toast.imageFailed', { name: file.name });
          if (isAppError(error)) toasts.push('error', error.code, { ...error.params });
        }
        reset();
      } finally {
        setLoading(null);
      }
    },
    [images, onActivate, profile.kind, reset, toasts],
  );

  // Renderiza la vista previa cuando cambian los parámetros (gana la última petición).
  useEffect(() => {
    if (!image) return;
    const id = ++request.current;
    void images
      .render(source, params, width, height)
      .then(({ pixels, histogram: hist }) => {
        if (id !== request.current) return;
        store.setPreview(pixels, previewMode);
        setHistogram(hist);
      })
      .catch((error: unknown) => {
        if (isAppError(error) && error.code !== 'task.cancelled')
          toasts.push('error', error.code, { ...error.params });
      });
  }, [image, source, params, width, height, images, store, toasts, previewMode]);

  // Histograma.
  useEffect(() => {
    const canvas = histCanvas.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx || !histogram) return;
    const h = canvas.height;
    ctx.clearRect(0, 0, 256, h);
    let max = 1;
    for (let i = 1; i < 255; i++) max = Math.max(max, histogram[i]!);
    ctx.fillStyle = '#7f8aa3';
    for (let i = 0; i < 256; i++) {
      const bar = Math.min(1, Math.sqrt(histogram[i]! / max)) * (h - 4);
      ctx.fillRect(i, h - bar, 1, bar);
    }
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0, 0, params.blackPoint, h);
    ctx.fillRect(params.whitePoint, 0, 256 - params.whitePoint, h);
  }, [histogram, params.blackPoint, params.whitePoint]);

  // Pegar y soltar imágenes en cualquier parte de la ventana.
  useEffect(() => {
    const pickImage = (files: FileList | null | undefined) =>
      [...(files ?? [])].find(
        (f) => f.type.startsWith('image/') || /\.(png|jpe?g|webp|gif)$/i.test(f.name),
      );
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) return;
      const file = pickImage(e.clipboardData?.files);
      if (file) {
        e.preventDefault();
        void load(file);
      }
    };
    const onDragOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes('Files')) {
        e.preventDefault();
        setOver(true);
      }
    };
    const onDragLeave = () => setOver(false);
    const onDrop = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      setOver(false);
      const file = pickImage(e.dataTransfer.files);
      if (file) void load(file);
    };
    document.addEventListener('paste', onPaste);
    document.addEventListener('dragover', onDragOver);
    document.addEventListener('dragleave', onDragLeave);
    document.addEventListener('drop', onDrop);
    return () => {
      document.removeEventListener('paste', onPaste);
      document.removeEventListener('dragover', onDragOver);
      document.removeEventListener('dragleave', onDragLeave);
      document.removeEventListener('drop', onDrop);
    };
  }, [load]);

  const set = (patch: Partial<ImageParams>) => setParams((p) => ({ ...p, ...patch }));
  const sources = image?.info.sources ?? [];
  const current = sources[source];

  const importSequence = async () => {
    setProcessing(0);
    try {
      const frames = await images.renderAll(params, width, height, (done, total) =>
        setProcessing(Math.round((done / total) * 100)),
      );
      if (store.importSequence(frames, replaceFrames)) {
        toasts.push('success', 'toast.sequenceImported', { frames: frames.length });
        reset();
      }
    } catch (error) {
      if (isAppError(error))
        toasts.push(error.code === 'task.cancelled' ? 'info' : 'error', error.code, {
          ...error.params,
        });
      // Cancelar termina el worker y descarta la imagen decodificada.
      if (isAppError(error) && error.code === 'task.cancelled') reset();
    } finally {
      setProcessing(null);
    }
  };

  return (
    <>
      <div className="dropzone" data-over={over} data-testid="dropzone">
        <PixelIcon name="open" />
        <span>{tk('image.drop')}</span>
        <button
          type="button"
          className="btn"
          onClick={() => fileInput.current?.click()}
          disabled={loading !== null}
        >
          {tk('image.choose')}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif,.png,.jpg,.jpeg,.webp,.gif"
          hidden
          data-testid="image-input"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (file) void load(file);
          }}
        />
      </div>

      {loading !== null ? (
        <div className="row" role="status">
          <label htmlFor={`${ids}-load`}>{tk('image.loading', { percent: loading })}</label>
          <progress id={`${ids}-load`} max={100} value={loading} />
          <button type="button" className="btn" onClick={() => images.cancel()}>
            {tk('image.cancelLoad')}
          </button>
        </div>
      ) : null}

      {image && current ? (
        <>
          <p className="hint" data-testid="image-info">
            {sources.length > 1
              ? tk('image.sourceFrames', { frames: sources.length, name: image.name })
              : tk('image.source', {
                  name: image.name,
                  width: image.info.originalWidth,
                  height: image.info.originalHeight,
                })}
          </p>
          {current.width !== image.info.originalWidth ? (
            <p className="hint">
              {tk('image.reduced', { width: current.width, height: current.height })}
            </p>
          ) : null}
          {sources.length > 1 ? (
            <SliderRow
              id={`${ids}-src`}
              label={tk('image.frame')}
              min={0}
              max={sources.length - 1}
              value={source}
              display={tk('image.frameValue', { frame: source + 1, frames: sources.length })}
              onChange={setSource}
            />
          ) : null}

          <fieldset className="group">
            <legend>{tk('image.group.framing')}</legend>
            <div className="row">
              <label htmlFor={`${ids}-fit`}>{tk('image.fit')}</label>
              <select
                id={`${ids}-fit`}
                className="field grow"
                value={params.fit}
                onChange={(e) => set({ fit: e.target.value as ImageParams['fit'] })}
              >
                {FIT_MODES.map((m) => (
                  <option key={m} value={m}>
                    {tk(`image.fit.${m}` as MessageKey)}
                  </option>
                ))}
              </select>
            </div>
            <SliderRow
              id={`${ids}-scale`}
              label={tk('image.scale')}
              min={10}
              max={400}
              value={params.scalePercent}
              onChange={(v) => set({ scalePercent: v })}
            />
            <SliderRow
              id={`${ids}-ox`}
              label={tk('image.offsetX')}
              min={-width}
              max={width}
              value={params.offsetX}
              onChange={(v) => set({ offsetX: v })}
            />
            <SliderRow
              id={`${ids}-oy`}
              label={tk('image.offsetY')}
              min={-height}
              max={height}
              value={params.offsetY}
              onChange={(v) => set({ offsetY: v })}
            />
            <div className="row">
              <label htmlFor={`${ids}-rot`}>{tk('image.rotation')}</label>
              <select
                id={`${ids}-rot`}
                className="field"
                value={params.rotation}
                onChange={(e) =>
                  set({ rotation: Number(e.target.value) as ImageParams['rotation'] })
                }
              >
                {ROTATIONS.map((r) => (
                  <option key={r} value={r}>
                    {tk('image.rotation.value', { degrees: r })}
                  </option>
                ))}
              </select>
              <label className="check">
                <input
                  type="checkbox"
                  checked={params.flipH}
                  onChange={(e) => set({ flipH: e.target.checked })}
                />
                {tk('image.flipH')}
              </label>
              <label className="check">
                <input
                  type="checkbox"
                  checked={params.flipV}
                  onChange={(e) => set({ flipV: e.target.checked })}
                />
                {tk('image.flipV')}
              </label>
            </div>
            <div className="row">
              <label htmlFor={`${ids}-bg`}>{tk('image.background')}</label>
              <select
                id={`${ids}-bg`}
                className="field"
                value={params.background}
                onChange={(e) => set({ background: e.target.value as ImageParams['background'] })}
              >
                <option value="white">{tk('image.background.white')}</option>
                <option value="black">{tk('image.background.black')}</option>
              </select>
            </div>
          </fieldset>

          <fieldset className="group">
            <legend>{tk('image.group.levels')}</legend>
            <canvas
              ref={histCanvas}
              className="histogram"
              width={256}
              height={70}
              role="img"
              aria-label={tk('image.histogram')}
            />
            <SliderRow
              id={`${ids}-bp`}
              label={tk('image.blackPoint')}
              min={0}
              max={254}
              value={params.blackPoint}
              onChange={(v) => set({ blackPoint: Math.min(v, params.whitePoint - 1) })}
            />
            <SliderRow
              id={`${ids}-wp`}
              label={tk('image.whitePoint')}
              min={1}
              max={255}
              value={params.whitePoint}
              onChange={(v) => set({ whitePoint: Math.max(v, params.blackPoint + 1) })}
            />
            <SliderRow
              id={`${ids}-gamma`}
              label={tk('image.gamma')}
              min={20}
              max={300}
              value={params.gammaCenti}
              display={formatNumber(params.gammaCenti / 100)}
              onChange={(v) => set({ gammaCenti: v })}
            />
            <SliderRow
              id={`${ids}-bri`}
              label={tk('image.brightness')}
              min={-100}
              max={100}
              value={params.brightness}
              onChange={(v) => set({ brightness: v })}
            />
            <SliderRow
              id={`${ids}-con`}
              label={tk('image.contrast')}
              min={-100}
              max={100}
              value={params.contrast}
              onChange={(v) => set({ contrast: v })}
            />
            <div className="row">
              <button
                type="button"
                className="btn"
                disabled={!histogram}
                onClick={() => histogram && set(autoLevels(histogram))}
              >
                {tk('image.autoLevels')}
              </button>
              <button
                type="button"
                className="btn"
                onClick={() =>
                  set({
                    blackPoint: 0,
                    whitePoint: 255,
                    gammaCenti: 100,
                    brightness: 0,
                    contrast: 0,
                    threshold: 128,
                  })
                }
              >
                {tk('image.resetLevels')}
              </button>
            </div>
          </fieldset>

          <fieldset className="group">
            <legend>{tk('image.group.convert')}</legend>
            <div className="row">
              <label htmlFor={`${ids}-dither`}>{tk('image.dither')}</label>
              <select
                id={`${ids}-dither`}
                className="field grow"
                value={params.dither}
                onChange={(e) => set({ dither: e.target.value as ImageParams['dither'] })}
              >
                {DITHER_MODES.map((m) => (
                  <option key={m} value={m}>
                    {tk(`image.dither.${m}` as MessageKey)}
                  </option>
                ))}
              </select>
            </div>
            <SliderRow
              id={`${ids}-thr`}
              label={tk('image.threshold')}
              min={0}
              max={255}
              value={params.threshold}
              onChange={(v) => set({ threshold: v })}
            />
            <div className="row">
              <label htmlFor={`${ids}-lit`}>{tk('image.litFrom')}</label>
              <select
                id={`${ids}-lit`}
                className="field"
                value={params.litFrom}
                onChange={(e) => set({ litFrom: e.target.value as ImageParams['litFrom'] })}
              >
                <option value="dark">{tk('image.litFrom.dark')}</option>
                <option value="light">{tk('image.litFrom.light')}</option>
              </select>
              <label className="check">
                <input
                  type="checkbox"
                  checked={params.invert}
                  onChange={(e) => set({ invert: e.target.checked })}
                />
                {tk('image.invert')}
              </label>
            </div>
            <div className="row">
              <label htmlFor={`${ids}-mode`}>{tk('image.mode')}</label>
              <select
                id={`${ids}-mode`}
                className="field grow"
                value={previewMode}
                onChange={(e) =>
                  store.setPreview(store.getState().preview, e.target.value as 'replace' | 'or')
                }
              >
                <option value="replace">{tk('image.mode.replace')}</option>
                <option value="or">{tk('image.mode.or')}</option>
              </select>
            </div>
          </fieldset>

          <div className="row">
            <button
              type="button"
              className="btn primary"
              data-testid="image-apply"
              onClick={() => store.applyPreview(false)}
            >
              {tk('image.applyFrame')}
            </button>
            <button
              type="button"
              className="btn"
              disabled={frameCount >= LIMITS.maxFrames}
              onClick={() => store.applyPreview(true)}
            >
              {tk('image.applyNew')}
            </button>
          </div>
          {sources.length > 1 ? (
            <div className="row">
              <button
                type="button"
                className="btn"
                data-testid="image-sequence"
                disabled={processing !== null}
                onClick={() => void importSequence()}
              >
                {tk('image.importSequence', { frames: sources.length })}
              </button>
              <label className="check">
                <input
                  type="checkbox"
                  checked={replaceFrames}
                  onChange={(e) => setReplaceFrames(e.target.checked)}
                />
                {tk('image.sequenceReplace')}
              </label>
            </div>
          ) : null}
          {processing !== null ? (
            <div className="row" role="status">
              <label htmlFor={`${ids}-proc`}>
                {tk('image.processing', { percent: processing })}
              </label>
              <progress id={`${ids}-proc`} max={100} value={processing} />
              <button type="button" className="btn" onClick={() => images.cancel()}>
                {tk('image.cancelLoad')}
              </button>
            </div>
          ) : null}
          <button type="button" className="btn" onClick={reset}>
            {tk('image.close')}
          </button>
        </>
      ) : null}
    </>
  );
}
