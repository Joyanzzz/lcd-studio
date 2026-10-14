import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { isAppError } from '../../core/errors.ts';
import { safeFileName } from '../../core/names.ts';
import { createZip } from '../../core/zip.ts';
import {
  exportersFor,
  type Diagnostic,
  type ExportFile,
  type OptionField,
} from '../../exporters/index.ts';
import type { Inspection } from '../../workers/export-client.ts';
import { reportError } from '../app-actions.ts';
import { useEditor, usePreferences, useServices } from '../app-context.tsx';
import { useProfile } from '../hooks.ts';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { PixelIcon } from './PixelIcon.tsx';

/** Referencia estable para no recalcular cuando no hay opciones guardadas. */
const NO_OPTIONS: Record<string, unknown> = Object.freeze({});

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

export function ExportPanel() {
  const { tk, t, issue } = useI18n();
  const services = useServices();
  const { exports, platform, preferences, toasts, appVersion } = services;
  const prefs = usePreferences();
  const profile = useProfile();
  const project = useEditor((s) => s.project);
  const current = useEditor((s) => s.current);
  const ids = useId();

  const available = useMemo(
    () => exportersFor(profile, prefs.experimental),
    [profile, prefs.experimental],
  );
  const exporter = available.find((e) => e.id === prefs.exporter) ?? available[0]!;
  const rawOptions = (prefs.exportOptions[exporter.id] ?? NO_OPTIONS) as Record<string, unknown>;
  const ctx = useMemo(
    () => ({ project, profile, currentFrame: current, appVersion }),
    [project, profile, current, appVersion],
  );
  // Normalizar opciones y calcular los campos es barato; la validación completa
  // (que recorre todos los fotogramas) se hace en el worker de exportación.
  const options = useMemo(
    () => exporter.normalize(rawOptions, ctx) as Record<string, unknown>,
    [exporter, rawOptions, ctx],
  );
  const fields = useMemo(() => exporter.fields(ctx, options as never), [exporter, ctx, options]);

  // Los resultados (validación y archivos) solo valen para las entradas con que se calcularon.
  const inputs = useMemo(() => ({ exporter, ctx, rawOptions }), [exporter, ctx, rawOptions]);
  const [checked, setChecked] = useState<{ inputs: object; result: Inspection } | null>(null);
  const inspection = checked && checked.inputs === inputs ? checked.result : null;
  const blocked = inspection === null || inspection.diagnostics.some((d) => d.severity === 'error');

  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      exports
        .inspect(exporter.id, project, rawOptions, current, appVersion, prefs.experimental)
        .then((result) => {
          if (!cancelled) setChecked({ inputs, result });
        })
        .catch((error: unknown) => {
          if (!cancelled && !(isAppError(error) && error.code === 'task.cancelled')) {
            reportError(services, error);
          }
        });
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [
    exports,
    exporter,
    project,
    rawOptions,
    current,
    appVersion,
    prefs.experimental,
    inputs,
    services,
  ]);
  const [generated, setGenerated] = useState<{
    inputs: object;
    files: readonly ExportFile[];
  } | null>(null);
  const files = generated && generated.inputs === inputs ? generated.files : null;
  const [selectedFile, setSelectedFile] = useState(0);
  const [busy, setBusy] = useState(false);
  const imageUrl = useRef<string | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  // Una generación en curso con entradas antiguas se cancela.
  useEffect(() => () => exports.cancel(), [exports, inputs]);

  const file = files?.[selectedFile];
  const previewText = useMemo(
    () => (file?.text ? new TextDecoder().decode(file.data) : ''),
    [file],
  );

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

  const updateOption = (key: string, value: unknown) => {
    preferences.update({
      exportOptions: { ...prefs.exportOptions, [exporter.id]: setPath(options, key, value) },
    });
  };

  const generate = async () => {
    setBusy(true);
    try {
      const outcome = await exports.run(
        exporter.id,
        project,
        options,
        current,
        appVersion,
        prefs.experimental,
      );
      if (outcome.files) {
        setGenerated({ inputs, files: outcome.files });
        setSelectedFile(0);
      } else {
        for (const d of outcome.diagnostics.filter((x) => x.severity === 'error'))
          toasts.push('error', d.code, { ...(d.params ?? {}) });
      }
    } catch (error) {
      if (!(isAppError(error) && error.code === 'task.cancelled')) reportError(services, error);
    } finally {
      setBusy(false);
    }
  };

  const download = async (f: ExportFile) => {
    try {
      const saved = await platform.saveExport(f.data, f.name, f.mime);
      if (saved) toasts.push('success', 'export.saved', { name: saved.name });
    } catch (error) {
      reportError(services, error);
    }
  };

  const downloadZip = async () => {
    if (!files) return;
    try {
      const zip = createZip(files.map((f) => ({ name: f.name, data: f.data })));
      const name = safeFileName(`${project.name}_${exporter.id}`, '.zip');
      const saved = await platform.saveExport(zip, name, 'application/zip');
      if (saved) toasts.push('success', 'export.saved', { name: saved.name });
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
  const est = inspection?.estimate;
  const groups: { key: MessageKey; ids: string[] }[] = [
    {
      key: 'export.group.code',
      ids: available.filter((e) => e.category !== 'image').map((e) => e.id),
    },
    {
      key: 'export.group.image',
      ids: available.filter((e) => e.category === 'image').map((e) => e.id),
    },
  ];

  return (
    <>
      <div className="row">
        <label htmlFor={`${ids}-format`}>{tk('export.format')}</label>
        <select
          id={`${ids}-format`}
          className="field grow"
          data-testid="export-format"
          value={exporter.id}
          onChange={(e) => preferences.update({ exporter: e.target.value })}
        >
          {groups.map((g) => (
            <optgroup key={g.key} label={tk(g.key)}>
              {g.ids.map((id) => {
                const e = available.find((x) => x.id === id)!;
                return (
                  <option key={id} value={id}>
                    {t(e.labelKey)}
                    {e.stability === 'experimental' ? ` — ${tk('export.experimentalBadge')}` : ''}
                  </option>
                );
              })}
            </optgroup>
          ))}
        </select>
      </div>
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

      {fields.map(renderField)}

      <fieldset className="group">
        <legend>{tk('export.memory')}</legend>
        {est ? (
          <div className="meter" data-testid="export-memory">
            <span>{tk('export.memory.data', { bytes: est.dataBytes })}</span>
            {est.flashBytes !== undefined && est.flashBudget !== undefined ? (
              <span>
                {tk('export.memory.flash', { used: est.flashBytes, max: est.flashBudget })}
              </span>
            ) : null}
            {est.ramBytes !== undefined && est.ramBudget !== undefined ? (
              <span>{tk('export.memory.ram', { used: est.ramBytes, max: est.ramBudget })}</span>
            ) : null}
            <span>{tk('export.memory.output', { bytes: est.outputBytes })}</span>
          </div>
        ) : (
          <p className="hint" role="status">
            {tk('export.checking')}
          </p>
        )}
      </fieldset>

      <fieldset className="group">
        <legend>{tk('export.diagnostics')}</legend>
        <ul className="diagnostics" data-testid="export-diagnostics" aria-live="polite">
          {inspection === null ? <li>{tk('export.checking')}</li> : null}
          {inspection?.diagnostics.length === 0 ? <li>{tk('export.noIssues')}</li> : null}
          {(inspection?.diagnostics ?? []).map((d, i) => (
            <li key={`${d.code}-${i}`} data-severity={d.severity}>
              <PixelIcon
                name={
                  d.severity === 'error' ? 'error' : d.severity === 'warning' ? 'warning' : 'info'
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
                        tk('export.cell', { frame: c.frame + 1, row: c.row + 1, col: c.col + 1 }),
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
      </fieldset>

      <div className="row">
        <button
          type="button"
          className="btn primary"
          data-testid="export-generate"
          disabled={blocked || busy}
          onClick={() => void generate()}
        >
          <PixelIcon name="export" />
          {busy ? tk('export.generating') : tk('export.generate')}
        </button>
        {busy ? (
          <button type="button" className="btn" onClick={() => exports.cancel()}>
            {tk('dialog.cancel')}
          </button>
        ) : null}
      </div>

      {files ? (
        <fieldset className="group">
          <legend>{tk('export.files')}</legend>
          {files.length > 1 ? (
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
            </>
          ) : previewUrl ? (
            <img
              src={previewUrl}
              alt={tk('export.imagePreview', { name: file?.name ?? '' })}
              className="export-image-preview"
            />
          ) : null}
          <div className="row">
            {file ? (
              <button
                type="button"
                className="btn"
                data-testid="export-download"
                onClick={() => void download(file)}
              >
                <PixelIcon name="save" />
                {tk('export.downloadFile', { name: file.name })}
              </button>
            ) : null}
            {file?.text ? (
              <button type="button" className="btn" onClick={() => void copy()}>
                {tk('export.copy')}
              </button>
            ) : null}
            {files.length > 1 ? (
              <button
                type="button"
                className="btn"
                data-testid="export-zip"
                onClick={() => void downloadZip()}
              >
                {tk('export.downloadZip')}
              </button>
            ) : null}
          </div>
        </fieldset>
      ) : null}
    </>
  );
}
