import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { resolveColors, type Appearance } from '../../core/appearance.ts';
import { fitProjectToCgram, type FitScope } from '../../core/cgram-fit.ts';
import { useEditor, usePreferences, useServices } from '../app-context.tsx';
import { useI18n } from '../i18n/index.tsx';
import { Dialog } from './Dialog.tsx';

function PixelPreview(props: {
  pixels: Uint8Array;
  width: number;
  height: number;
  appearance: Appearance;
  label: string;
}) {
  const { pixels, width, height, appearance, label } = props;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext('2d');
    if (!ctx) return;
    const colors = resolveColors(appearance);
    ctx.fillStyle = colors.off;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = colors.on;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) if (pixels[y * width + x]) ctx.fillRect(x, y, 1, 1);
  }, [pixels, width, height, appearance]);
  return <canvas ref={ref} width={width} height={height} role="img" aria-label={label} />;
}

/**
 * Ajuste a 8 caracteres propios: muestra qué cambiaría (antes y después) y solo
 * modifica el proyecto cuando el usuario lo confirma; después se puede deshacer.
 */
export function CgramFitDialog(props: { open: boolean; onClose: () => void }) {
  const { open, onClose } = props;
  const { tk } = useI18n();
  const { store } = useServices();
  const prefs = usePreferences();
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.current);
  const [scope, setScope] = useState<FitScope>('current');
  const scopeName = useId();

  const all = useMemo(
    () => (open ? fitProjectToCgram(project, 'all', current) : []),
    [open, project, current],
  );
  const hasOthers = all.some((f) => f.frameIndex !== current);
  const fits = scope === 'all' && hasOthers ? all : all.filter((f) => f.frameIndex === current);
  const shown = fits.find((f) => f.frameIndex === current) ?? fits[0];
  const cells = fits.reduce((sum, f) => sum + f.changedCells.length, 0);
  const pixels = fits.reduce((sum, f) => sum + f.changedPixels, 0);
  const frame = shown ? shown.frameIndex + 1 : 0;

  const apply = () => {
    store.fitCgram(hasOthers ? scope : 'current');
    onClose();
  };

  return (
    <Dialog
      open={open}
      title={tk('dialog.cgramFit.title')}
      onClose={onClose}
      testId="cgram-fit-dialog"
      initialFocus='[data-testid="cgram-fit-apply"]'
      actions={
        <>
          <button
            type="button"
            className="btn primary"
            disabled={fits.length === 0}
            onClick={apply}
            data-testid="cgram-fit-apply"
          >
            {tk('dialog.cgramFit.apply')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {tk('dialog.cancel')}
          </button>
        </>
      }
    >
      <p>{tk('dialog.cgramFit.intro')}</p>
      {prefs.experimental && project.romCharset === 'none' ? (
        <p className="hint">{tk('dialog.cgramFit.romHint')}</p>
      ) : null}
      {hasOthers ? (
        <fieldset className="group">
          <legend>{tk('dialog.cgramFit.scope')}</legend>
          <label className="check">
            <input
              type="radio"
              name={scopeName}
              checked={scope === 'current'}
              onChange={() => setScope('current')}
            />{' '}
            {tk('dialog.cgramFit.scope.current')}
          </label>
          <label className="check">
            <input
              type="radio"
              name={scopeName}
              checked={scope === 'all'}
              onChange={() => setScope('all')}
              data-testid="cgram-fit-all"
            />{' '}
            {tk('dialog.cgramFit.scope.all', { frames: all.length })}
          </label>
        </fieldset>
      ) : null}
      {shown ? (
        <>
          <p data-testid="cgram-fit-summary" role="status">
            {tk('dialog.cgramFit.summary', { frames: fits.length, cells, pixels })}
          </p>
          <div className="fit-previews">
            <figure className="fit-preview">
              <figcaption>{tk('dialog.cgramFit.before', { frame })}</figcaption>
              <PixelPreview
                pixels={project.frames[shown.frameIndex]!.pixels}
                width={project.width}
                height={project.height}
                appearance={project.appearance}
                label={tk('dialog.cgramFit.before', { frame })}
              />
            </figure>
            <figure className="fit-preview">
              <figcaption>{tk('dialog.cgramFit.after', { frame })}</figcaption>
              <PixelPreview
                pixels={shown.pixels}
                width={project.width}
                height={project.height}
                appearance={project.appearance}
                label={tk('dialog.cgramFit.after', { frame })}
              />
            </figure>
          </div>
        </>
      ) : null}
    </Dialog>
  );
}
