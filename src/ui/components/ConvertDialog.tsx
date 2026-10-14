import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { resolveColors, type Appearance } from '../../core/appearance.ts';
import { convertProject, CONVERT_MODES, type ConvertMode } from '../../core/convert.ts';
import { isAppError } from '../../core/errors.ts';
import { LIMITS } from '../../core/limits.ts';
import { DISPLAY_PROFILES, getProfile } from '../../device-profiles/index.ts';
import { saveProject } from '../app-actions.ts';
import { useEditor, useServices } from '../app-context.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { Dialog } from './Dialog.tsx';
import { FAMILIES } from './ProjectSetup.tsx';

function Preview(props: {
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
  return (
    <canvas
      ref={ref}
      width={width}
      height={height}
      role="img"
      aria-label={label}
      className="convert-preview"
    />
  );
}

/**
 * Proyecto → Convertir pantalla. Muestra antes de confirmar la vista previa
 * del fotograma actual y qué se recorta, escala o deja de ser compatible. La
 * conversión es una única edición deshacible; opcionalmente guarda antes una
 * copia del proyecto original. Nunca sobrescribe el archivo por su cuenta.
 */
export function ConvertDialog(props: { open: boolean; onClose: () => void }) {
  return props.open ? <ConvertBody onClose={props.onClose} /> : null;
}

function ConvertBody({ onClose }: { onClose: () => void }) {
  const { tk, t } = useI18n();
  const services = useServices();
  const { store } = services;
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.current);
  const ids = useId();
  const [profileId, setProfileId] = useState(project.profileId);
  const [size, setSize] = useState({ width: project.width, height: project.height });
  const [mode, setMode] = useState<ConvertMode>('crop-top-left');
  const [keepCopy, setKeepCopy] = useState(true);
  const [error, setError] = useState<MessageKey | null>(null);
  const [busy, setBusy] = useState(false);
  const profile = getProfile(profileId)!;
  const custom = profile.kind === 'graphic' && !profile.fixedSize;

  const result = useMemo(() => {
    try {
      return convertProject(project, profileId, custom ? size : undefined, mode);
    } catch (e) {
      if (isAppError(e)) return null;
      throw e;
    }
  }, [project, profileId, custom, size, mode]);
  const report = result?.report;
  const unchanged = profileId === project.profileId && report !== undefined && !report.sizeChanged;

  const confirm = async () => {
    if (!result || unchanged) return;
    setBusy(true);
    try {
      if (keepCopy) {
        // Copia del original antes de convertir (se descarga o se guarda aparte).
        const saved = await saveProject(
          services,
          services.platform.kind === 'desktop' ? 'saveAs' : 'save',
        );
        if (!saved) {
          setError('convert.copyFailed');
          return;
        }
      }
      if (store.convertDisplay(profileId, custom ? size : undefined, mode)) onClose();
    } finally {
      setBusy(false);
    }
  };

  const frame = project.frames[current]!;
  const after = result?.project.frames[current];
  const items: string[] = [];
  if (report) {
    if (report.sizeChanged)
      items.push(
        tk(`convert.report.${report.mode}` as MessageKey, {
          from: `${report.from.width} × ${report.from.height}`,
          to: `${report.to.width} × ${report.to.height}`,
        }),
      );
    if (report.lostLitPixels > 0)
      items.push(tk('convert.report.lost', { pixels: report.lostLitPixels }));
    if (report.familyChanged) items.push(tk('convert.report.family'));
    if (report.appearanceChanged) items.push(tk('convert.report.colors'));
    if (report.romReset) items.push(tk('convert.report.rom'));
    if (report.connectionReset || report.targetReset) items.push(tk('convert.report.device'));
    if (report.overLimitFrames.length > 0)
      items.push(tk('convert.report.overLimit', { frames: report.overLimitFrames.length }));
  }

  return (
    <Dialog
      open
      title={tk('convert.title')}
      onClose={onClose}
      testId="convert-dialog"
      actions={
        <>
          <button
            type="button"
            className="btn primary"
            disabled={!result || unchanged || busy}
            onClick={() => void confirm()}
            data-testid="convert-ok"
          >
            {tk('convert.apply')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {tk('dialog.cancel')}
          </button>
        </>
      }
    >
      <p className="hint">
        {tk('convert.current', { profile: t(getProfile(project.profileId)!.labelKey) })}
      </p>
      <div className="row">
        <label htmlFor={`${ids}-profile`}>{tk('convert.target')}</label>
        <select
          id={`${ids}-profile`}
          className="field grow"
          value={profileId}
          data-testid="convert-profile"
          onChange={(e) => {
            setProfileId(e.target.value);
            setError(null);
          }}
        >
          {FAMILIES.map((f) => (
            <optgroup key={f} label={tk(`family.${f}` as MessageKey)}>
              {DISPLAY_PROFILES.filter((p) => p.kind === f).map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.labelKey)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </div>
      {custom ? (
        <div className="row">
          <label htmlFor={`${ids}-w`}>{tk('project.width')}</label>
          <input
            id={`${ids}-w`}
            className="field narrow"
            type="number"
            min={1}
            max={LIMITS.canvasMaxSide}
            value={Number.isFinite(size.width) ? size.width : ''}
            onChange={(e) => setSize({ ...size, width: e.target.valueAsNumber })}
          />
          <label htmlFor={`${ids}-h`}>{tk('project.height')}</label>
          <input
            id={`${ids}-h`}
            className="field narrow"
            type="number"
            min={1}
            max={LIMITS.canvasMaxSide}
            value={Number.isFinite(size.height) ? size.height : ''}
            onChange={(e) => setSize({ ...size, height: e.target.valueAsNumber })}
          />
        </div>
      ) : null}
      {report?.sizeChanged ? (
        <fieldset className="group">
          <legend>{tk('convert.mode')}</legend>
          {CONVERT_MODES.map((m) => (
            <label key={m} className="check">
              <input
                type="radio"
                name={`${ids}-mode`}
                checked={mode === m}
                onChange={() => setMode(m)}
                data-testid={`convert-mode-${m}`}
              />
              {tk(`convert.mode.${m}` as MessageKey)}
            </label>
          ))}
        </fieldset>
      ) : null}
      {!result ? (
        <p className="error-text" role="alert">
          {tk('limits.canvasSize', {
            width: String(size.width),
            height: String(size.height),
            max: LIMITS.canvasMaxSide,
          })}
        </p>
      ) : (
        <>
          <div className="fit-previews">
            <figure className="fit-preview">
              <Preview
                pixels={frame.pixels}
                width={project.width}
                height={project.height}
                appearance={project.appearance}
                label={tk('convert.before', { frame: current + 1 })}
              />
              <figcaption>{tk('convert.before', { frame: current + 1 })}</figcaption>
            </figure>
            {after ? (
              <figure className="fit-preview">
                <Preview
                  pixels={after.pixels}
                  width={result.project.width}
                  height={result.project.height}
                  appearance={result.project.appearance}
                  label={tk('convert.after', { frame: current + 1 })}
                />
                <figcaption>{tk('convert.after', { frame: current + 1 })}</figcaption>
              </figure>
            ) : null}
          </div>
          <ul className="diagnostics" data-testid="convert-report">
            {unchanged ? <li>{tk('convert.report.none')}</li> : null}
            {items.map((text) => (
              <li key={text}>{text}</li>
            ))}
          </ul>
        </>
      )}
      <label className="check">
        <input
          type="checkbox"
          checked={keepCopy}
          onChange={(e) => setKeepCopy(e.target.checked)}
          data-testid="convert-copy"
        />
        {tk('convert.keepCopy')}
      </label>
      <p className="hint">{tk('convert.recovery')}</p>
      {error ? (
        <p className="error-text" role="alert">
          {tk(error)}
        </p>
      ) : null}
    </Dialog>
  );
}
