import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { isAppError } from '../../core/errors.ts';
import { safeFileName } from '../../core/names.ts';
import { createZip } from '../../core/zip.ts';
import { getProfile, targetsFor } from '../../device-profiles/index.ts';
import {
  formatChoices,
  optionsForContent,
  projectForContent,
  type FormatChoice,
  type FormatGroup,
} from '../../exporters/content.ts';
import type { Diagnostic, ExportFile, OptionField } from '../../exporters/index.ts';
import type { ExportContent } from '../../exporters/types.ts';
import type { Inspection } from '../../workers/export-client.ts';
import { reportError } from '../app-actions.ts';
import { useEditor, usePreferences, useServices } from '../app-context.tsx';
import { useProfile } from '../hooks.ts';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { Dialog } from './Dialog.tsx';
import { PixelIcon } from './PixelIcon.tsx';

/**
 * Asistente de exportación en cuatro pasos:
 *   1. contenido (fotograma actual, selección o animación completa);
 *   2. tipo y formato (imagen, datos de mapa de bits o código);
 *   3. opciones del formato;
 *   4. validación y resultado.
 * No se guarda ningún archivo hasta pulsar «Guardar». Las opciones se
 * recuerdan solo cuando se guarda una exportación (cancelar no cambia nada).
 */

const STEPS = ['content', 'format', 'options', 'result'] as const;
type Step = (typeof STEPS)[number];
const CONTENTS: readonly ExportContent[] = ['frame', 'selection', 'animation'];
const GROUPS: readonly FormatGroup[] = ['image', 'data', 'code'];

function getPath(obj: Record<string, unknown>, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      obj,
    );
}

function setPath(
  obj: Record<string, unknown>,
  path: string,
  value: unknown,
): Record<string, unknown> {
  const [head, ...rest] = path.split('.');
  if (!head) return obj;
  if (rest.length === 0) return { ...obj, [head]: value };
  const child = obj[head];
  return {
    ...obj,
    [head]: setPath(
      child && typeof child === 'object' ? (child as Record<string, unknown>) : {},
      rest.join('.'),
      value,
    ),
  };
}

export function ExportDialog(props: { open: boolean; onClose: () => void }) {
  return props.open ? <ExportWizard onClose={props.onClose} /> : null;
}

function ExportWizard({ onClose }: { onClose: () => void }) {
  const { tk, t, issue } = useI18n();
  const services = useServices();
  const { exports, platform, preferences, toasts, appVersion } = services;
  const prefs = usePreferences();
  const profile = useProfile();
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.current);
  const selection = useEditor((s) => s.selection);
  const ids = useId();

  // Borrador del asistente (se guarda en preferencias solo al exportar).
  const [step, setStep] = useState<Step>('content');
  const [content, setContent] = useState<ExportContent>(() => {
    const last = prefs.exportContent;
    if (last === 'selection' && !selection) return 'frame';
    if (last === 'animation' && project.frames.length < 2) return 'frame';
    return last;
  });
  const choices = useMemo(
    () => formatChoices(profile, project, content, prefs.experimental),
    [profile, project, content, prefs.experimental],
  );
  const preferred =
    project.device.codeTarget && content !== 'selection'
      ? project.device.codeTarget
      : prefs.exporter;
  const [exporterId, setExporterId] = useState(() => {
    const ok = choices.filter((c) => c.unavailableKey === null);
    return (ok.find((c) => c.exporter.id === preferred) ?? ok[0])?.exporter.id ?? '';
  });
  const choice: FormatChoice | undefined = choices.find(
    (c) => c.exporter.id === exporterId && c.unavailableKey === null,
  );
  const exporter = choice?.exporter;
  const [draftOptions, setDraftOptions] = useState<Record<string, Record<string, unknown>>>(() => ({
    ...(prefs.exportOptions as Record<string, Record<string, unknown>>),
  }));

  const target = useMemo(
    () => projectForContent(project, content, current, selection),
    [project, content, current, selection],
  );
  const rawOptions = useMemo(
    () => optionsForContent(exporter ? (draftOptions[exporter.id] ?? {}) : {}, content),
    [exporter, draftOptions, content],
  );
  const ctx = useMemo(
    () =>
      target && exporter
        ? {
            project: target.project,
            profile: getProfile(target.project.profileId) ?? profile,
            currentFrame: target.currentFrame,
            appVersion,
          }
        : null,
    [target, exporter, profile, appVersion],
  );
  const options = useMemo(
    () => (exporter && ctx ? (exporter.normalize(rawOptions, ctx) as Record<string, unknown>) : {}),
    [exporter, ctx, rawOptions],
  );
  const fields = useMemo(
    () =>
      exporter && ctx
        ? exporter.fields(ctx, options as never).filter((f) => f.key !== 'frames')
        : [],
    [exporter, ctx, options],
  );

  // Paso 4: validación en el worker y generación (sin guardar nada).
  const inputs = useMemo(() => ({ exporter, ctx, rawOptions }), [exporter, ctx, rawOptions]);
  const [checked, setChecked] = useState<{ inputs: object; result: Inspection } | null>(null);
  const inspection = checked && checked.inputs === inputs ? checked.result : null;
  const blocked = inspection === null || inspection.diagnostics.some((d) => d.severity === 'error');
  const [generated, setGenerated] = useState<{
    inputs: object;
    files: readonly ExportFile[];
  } | null>(null);
  const files = generated && generated.inputs === inputs ? generated.files : null;
  const [selectedFile, setSelectedFile] = useState(0);
  const [busy, setBusy] = useState(false);
  const [zip, setZip] = useState(true);

  useEffect(() => {
    if (step !== 'result' || !exporter || !ctx) return undefined;
    let cancelled = false;
    exports
      .inspect(
        exporter.id,
        ctx.project,
        rawOptions,
        ctx.currentFrame,
        appVersion,
        prefs.experimental,
      )
      .then(async (result) => {
        if (cancelled) return;
        setChecked({ inputs, result });
        if (result.diagnostics.some((d) => d.severity === 'error')) return;
        setBusy(true);
        const outcome = await exports.run(
          exporter.id,
          ctx.project,
          rawOptions,
          ctx.currentFrame,
          appVersion,
          prefs.experimental,
        );
        if (!cancelled && outcome.files) {
          setGenerated({ inputs, files: outcome.files });
          setSelectedFile(0);
        }
      })
      .catch((error: unknown) => {
        if (!cancelled && !(isAppError(error) && error.code === 'task.cancelled')) {
          reportError(services, error);
        }
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
      exports.cancel();
    };
  }, [step, exporter, ctx, rawOptions, appVersion, prefs.experimental, inputs, exports, services]);

  const file = files?.[selectedFile];
  const previewText = useMemo(
    () => (file?.text ? new TextDecoder().decode(file.data) : ''),
    [file],
  );
  const imageUrl = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  useEffect(() => {
    if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
    imageUrl.current = null;
    if (file && !file.text && file.mime.startsWith('image/')) {
      imageUrl.current = URL.createObjectURL(
        new Blob([file.data as Uint8Array<ArrayBuffer>], { type: file.mime }),
      );
    }
    setPreviewUrl(imageUrl.current);
    return () => {
      if (imageUrl.current) URL.revokeObjectURL(imageUrl.current);
      imageUrl.current = null;
    };
  }, [file]);

  /** Recuerda las opciones de esta exportación (solo al guardarla). */
  const remember = () => {
    if (!exporter) return;
    preferences.update({
      exporter: exporter.id,
      exportContent: content,
      exportOptions: { ...prefs.exportOptions, [exporter.id]: options },
    });
  };

  const save = async () => {
    if (!files || files.length === 0 || !exporter) return;
    try {
      let saved;
      if (files.length > 1 && zip) {
        const data = createZip(files.map((f) => ({ name: f.name, data: f.data })));
        saved = await platform.saveExport(
          data,
          safeFileName(`${project.name}_${exporter.id}`, '.zip'),
          'application/zip',
        );
      } else {
        for (const f of files) {
          saved = await platform.saveExport(f.data, f.name, f.mime);
          if (!saved) break;
        }
      }
      if (saved) {
        remember();
        toasts.push('success', 'export.saved', { name: saved.name });
        onClose();
      }
    } catch (error) {
      reportError(services, error);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(previewText);
      toasts.push('success', 'export.copied');
    } catch {
      toasts.push('warning', 'export.copyFailed');
    }
  };

  const updateOption = (key: string, value: unknown) => {
    if (!exporter) return;
    setDraftOptions({ ...draftOptions, [exporter.id]: setPath(options, key, value) });
  };

  const renderField = (field: OptionField) => {
    const id = `${ids}-${field.key}`;
    const value = getPath(options, field.key);
    const hint = field.hintKey ? (
      <p className="hint" id={`${id}-hint`}>
        {t(field.hintKey)}
      </p>
    ) : null;
    const describedBy = field.hintKey ? `${id}-hint` : undefined;
    switch (field.kind) {
      case 'boolean':
        return (
          <div key={field.key}>
            <label className="check">
              <input
                id={id}
                type="checkbox"
                checked={field.locked ? true : value === true}
                disabled={field.locked === true}
                aria-describedby={describedBy}
                onChange={(e) => updateOption(field.key, e.target.checked)}
              />
              {t(field.labelKey)}
            </label>
            {hint}
          </div>
        );
      case 'select':
        return (
          <div key={field.key}>
            <div className="row">
              <label htmlFor={id}>{t(field.labelKey)}</label>
              <select
                id={id}
                className="field grow"
                value={String(value)}
                aria-describedby={describedBy}
                onChange={(e) => {
                  const raw = e.target.value;
                  updateOption(field.key, typeof value === 'number' ? Number(raw) : raw);
                }}
              >
                {field.choices.map((c) => (
                  <option key={c.value} value={c.value}>
                    {t(c.labelKey)}
                  </option>
                ))}
              </select>
            </div>
            {hint}
          </div>
        );
      case 'number':
        return (
          <div key={field.key}>
            <div className="row">
              <label htmlFor={id}>{t(field.labelKey)}</label>
              <input
                id={id}
                className="field"
                type="number"
                min={field.min}
                max={field.max}
                step={field.step}
                value={typeof value === 'number' ? value : ''}
                aria-describedby={describedBy}
                onChange={(e) => {
                  const n = e.target.valueAsNumber;
                  if (Number.isFinite(n)) updateOption(field.key, n);
                }}
              />
            </div>
            {hint}
          </div>
        );
      case 'text':
        return (
          <div key={field.key}>
            <div className="row">
              <label htmlFor={id}>{t(field.labelKey)}</label>
              <input
                id={id}
                className="field grow"
                value={typeof value === 'string' ? value : ''}
                maxLength={field.maxLength}
                aria-describedby={describedBy}
                spellCheck={false}
                onChange={(e) => updateOption(field.key, e.target.value)}
              />
            </div>
            {hint}
          </div>
        );
    }
  };

  const diagnosticText = (d: Diagnostic) =>
    issue({ code: d.code, ...(d.params ? { params: d.params } : {}) });
  const targetLabel = (id: string): string | null => {
    const tgt = targetsFor(profile, project.device.connection).find((x) => x.exporterId === id);
    return tgt ? t(tgt.labelKey) : null;
  };
  const stepIndex = STEPS.indexOf(step);
  const canNext =
    (step === 'content' && target !== null) ||
    (step === 'format' && exporter !== undefined) ||
    step === 'options';
  const contentReason = (c: ExportContent): MessageKey | null =>
    c === 'selection' && !selection
      ? 'export.content.noSelection'
      : c === 'animation' && project.frames.length < 2
        ? 'export.content.oneFrame'
        : null;

  return (
    <Dialog
      open
      title={tk('dialog.export.title')}
      onClose={onClose}
      testId="export-dialog"
      actions={
        <>
          {stepIndex > 0 ? (
            <button
              type="button"
              className="btn"
              onClick={() => setStep(STEPS[stepIndex - 1]!)}
              data-testid="export-back"
            >
              {tk('wizard.back')}
            </button>
          ) : null}
          {step !== 'result' ? (
            <button
              type="button"
              className="btn primary"
              disabled={!canNext}
              onClick={() => setStep(STEPS[stepIndex + 1]!)}
              data-testid="export-next"
            >
              {tk('wizard.next')}
            </button>
          ) : (
            <button
              type="button"
              className="btn primary"
              disabled={blocked || busy || !files}
              onClick={() => void save()}
              data-testid="export-save"
            >
              <PixelIcon name="save" />
              {files && files.length > 1 && zip
                ? tk('export.saveZip', { count: files.length })
                : tk('export.save')}
            </button>
          )}
          <button type="button" className="btn" onClick={onClose}>
            {tk('dialog.cancel')}
          </button>
        </>
      }
    >
      <ol className="wizard-steps" aria-label={tk('wizard.steps')}>
        {STEPS.map((s, i) => (
          <li key={s} aria-current={s === step ? 'step' : undefined} data-done={i < stepIndex}>
            {i + 1}. {tk(`export.step.${s}` as MessageKey)}
          </li>
        ))}
      </ol>

      {step === 'content' ? (
        <fieldset className="group" data-testid="export-step-content">
          <legend>{tk('export.step.content')}</legend>
          {CONTENTS.map((c) => {
            const reason = contentReason(c);
            return (
              <div key={c}>
                <label className="check">
                  <input
                    type="radio"
                    name={`${ids}-content`}
                    value={c}
                    checked={content === c}
                    disabled={reason !== null}
                    aria-describedby={`${ids}-content-${c}`}
                    onChange={() => setContent(c)}
                    data-testid={`export-content-${c}`}
                  />
                  {tk(`export.content.${c}` as MessageKey)}
                </label>
                <p className="hint" id={`${ids}-content-${c}`}>
                  {reason
                    ? tk(reason)
                    : tk(`export.content.${c}.hint` as MessageKey, {
                        frame: current + 1,
                        frames: project.frames.length,
                        width: selection?.width ?? 0,
                        height: selection?.height ?? 0,
                      })}
                </p>
              </div>
            );
          })}
        </fieldset>
      ) : null}

      {step === 'format' ? (
        <div data-testid="export-step-format">
          {GROUPS.map((g) => {
            const list = choices.filter((c) => c.group === g);
            if (list.length === 0) return null;
            return (
              <fieldset key={g} className="group">
                <legend>{tk(`export.group.${g}` as MessageKey)}</legend>
                <p className="hint">{tk(`export.group.${g}.hint` as MessageKey)}</p>
                {list.map((c) => (
                  <div key={c.exporter.id}>
                    <label className="check">
                      <input
                        type="radio"
                        name={`${ids}-format`}
                        value={c.exporter.id}
                        checked={exporterId === c.exporter.id && c.unavailableKey === null}
                        disabled={c.unavailableKey !== null}
                        onChange={() => setExporterId(c.exporter.id)}
                        aria-describedby={`${ids}-fmt-${c.exporter.id}`}
                        data-testid={`export-format-${c.exporter.id}`}
                      />
                      {targetLabel(c.exporter.id) ?? t(c.exporter.labelKey)}
                      {c.exporter.stability === 'experimental' ? (
                        <span className="badge">{tk('export.experimentalBadge')}</span>
                      ) : null}
                      {project.device.codeTarget === c.exporter.id ? (
                        <span className="badge">{tk('export.projectTarget')}</span>
                      ) : null}
                    </label>
                    <p className="hint" id={`${ids}-fmt-${c.exporter.id}`}>
                      {c.unavailableKey ? t(c.unavailableKey) : t(c.exporter.descriptionKey)}
                    </p>
                  </div>
                ))}
              </fieldset>
            );
          })}
        </div>
      ) : null}

      {step === 'options' && exporter ? (
        <div data-testid="export-step-options">
          <p className="hint">{t(exporter.descriptionKey)}</p>
          {exporter.stability === 'experimental' ? (
            <p className="warn-text" role="note">
              <span className="badge">{tk('export.experimentalBadge')}</span>{' '}
              {tk('export.experimentalNotice')}
            </p>
          ) : null}
          <fieldset className="group">
            <legend>{tk('export.properties')}</legend>
            <ul className="diagnostics">
              <li>{tk('export.prop.extension', { ext: exporter.extension })}</li>
              <li>
                {tk('export.prop.orientation', {
                  value: t(`export.orientation.${exporter.orientation}`),
                })}
              </li>
              <li>
                {tk('export.prop.bitOrder', { value: t(`export.bitOrder.${exporter.bitOrder}`) })}
              </li>
              {exporter.constraintKeys.map((k) => (
                <li key={k}>{t(k)}</li>
              ))}
            </ul>
          </fieldset>
          {fields.length > 0 ? fields.map(renderField) : <p>{tk('export.noOptions')}</p>}
        </div>
      ) : null}

      {step === 'result' && exporter ? (
        <div data-testid="export-step-result">
          <fieldset className="group">
            <legend>{tk('export.diagnostics')}</legend>
            <ul className="diagnostics" data-testid="export-diagnostics" aria-live="polite">
              {inspection === null ? <li>{tk('export.checking')}</li> : null}
              {inspection?.diagnostics.length === 0 ? <li>{tk('export.noIssues')}</li> : null}
              {(inspection?.diagnostics ?? []).map((d, i) => (
                <li key={`${d.code}-${i}`} data-severity={d.severity}>
                  <PixelIcon
                    name={
                      d.severity === 'error'
                        ? 'error'
                        : d.severity === 'warning'
                          ? 'warning'
                          : 'info'
                    }
                  />
                  <span className={d.severity === 'error' ? 'error-text' : undefined}>
                    {diagnosticText(d)}
                    {d.cells && d.cells.length > 0 ? (
                      <>
                        {' '}
                        (
                        {d.cells
                          .slice(0, 24)
                          .map((c) =>
                            tk('export.cell', {
                              frame: c.frame + 1,
                              row: c.row + 1,
                              col: c.col + 1,
                            }),
                          )
                          .join('; ')}
                        {d.cells.length > 24 ? '…' : ''})
                      </>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
            {blocked && inspection !== null ? (
              <p className="error-text" role="alert">
                {tk('export.blocked')}
              </p>
            ) : null}
            {inspection?.estimate ? (
              <div className="meter" data-testid="export-memory">
                <span>{tk('export.memory.data', { bytes: inspection.estimate.dataBytes })}</span>
                {inspection.estimate.flashBytes !== undefined &&
                inspection.estimate.flashBudget !== undefined ? (
                  <span>
                    {tk('export.memory.flash', {
                      used: inspection.estimate.flashBytes,
                      max: inspection.estimate.flashBudget,
                    })}
                  </span>
                ) : null}
                {inspection.estimate.ramBytes !== undefined &&
                inspection.estimate.ramBudget !== undefined ? (
                  <span>
                    {tk('export.memory.ram', {
                      used: inspection.estimate.ramBytes,
                      max: inspection.estimate.ramBudget,
                    })}
                  </span>
                ) : null}
                <span>
                  {tk('export.memory.output', { bytes: inspection.estimate.outputBytes })}
                </span>
              </div>
            ) : null}
          </fieldset>
          {busy ? (
            <p role="status">
              {tk('export.generating')}{' '}
              <button type="button" className="btn compact" onClick={() => exports.cancel()}>
                {tk('dialog.cancel')}
              </button>
            </p>
          ) : null}
          {files ? (
            <fieldset className="group">
              <legend>{tk('export.files')}</legend>
              {files.length > 1 ? (
                <>
                  <div className="file-tabs" role="group" aria-label={tk('export.files')}>
                    {files.map((f, i) => (
                      <button
                        key={f.name}
                        type="button"
                        className="btn compact"
                        aria-pressed={i === selectedFile}
                        onClick={() => setSelectedFile(i)}
                      >
                        {f.name}
                      </button>
                    ))}
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={zip}
                      onChange={(e) => setZip(e.target.checked)}
                      data-testid="export-zip"
                    />
                    {tk('export.packZip')}
                  </label>
                  <p className="hint">{tk('export.packZip.hint')}</p>
                </>
              ) : null}
              {file?.text ? (
                <>
                  <label className="visually-hidden" htmlFor={`${ids}-preview`}>
                    {tk('export.preview')}
                  </label>
                  <textarea
                    id={`${ids}-preview`}
                    className="field export-preview"
                    readOnly
                    value={previewText}
                    spellCheck={false}
                    data-testid="export-preview"
                  />
                  <button type="button" className="btn" onClick={() => void copy()}>
                    {tk('export.copy')}
                  </button>
                </>
              ) : previewUrl ? (
                <img
                  src={previewUrl}
                  alt={tk('export.imagePreview', { name: file?.name ?? '' })}
                  className="export-image-preview"
                />
              ) : null}
            </fieldset>
          ) : null}
        </div>
      ) : null}
    </Dialog>
  );
}
