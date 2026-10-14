import { useId, useState } from 'react';
import {
  CUSTOM_PALETTE_ID,
  PALETTES,
  resolveColors,
  type Appearance,
  type LcdColors,
} from '../../core/appearance.ts';
import type { DeviceConfig } from '../../core/device.ts';
import { LIMITS } from '../../core/limits.ts';
import { LOOP_MODES, type LoopMode } from '../../core/project.ts';
import { getRomCharset, type RomCharsetId } from '../../device-profiles/index.ts';
import { useEditor, usePreferences, useServices } from '../app-context.tsx';
import { useCommands } from '../commands.tsx';
import { useProfile } from '../hooks.ts';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { Dialog } from './Dialog.tsx';
import { DeviceFields } from './ProjectSetup.tsx';

interface Draft {
  name: string;
  romCharset: RomCharsetId;
  appearance: Appearance;
  loopMode: LoopMode;
  device: DeviceConfig;
}

/**
 * Configuración del proyecto en una ventana emergente. Se edita un borrador:
 * «Aceptar» aplica todo en un solo paso deshacible; cerrar o cancelar no
 * cambia nada.
 */
export function ProjectSettingsDialog(props: { open: boolean; onClose: () => void }) {
  return props.open ? <ProjectSettingsBody onClose={props.onClose} /> : null;
}

function ProjectSettingsBody({ onClose }: { onClose: () => void }) {
  const { tk, t } = useI18n();
  const { store } = useServices();
  const { openDialog } = useCommands();
  const prefs = usePreferences();
  const project = useEditor((s) => s.project);
  const profile = useProfile();
  const ids = useId();
  const [draft, setDraft] = useState<Draft>(() => ({
    name: project.name,
    romCharset: project.romCharset,
    appearance: project.appearance,
    loopMode: project.loopMode,
    device: project.device,
  }));
  const [error, setError] = useState<MessageKey | null>(null);
  const colors = resolveColors(draft.appearance);
  const paletteId = 'colors' in draft.appearance ? CUSTOM_PALETTE_ID : draft.appearance.palette;
  const romChoices =
    profile.kind === 'character'
      ? profile.romCharsets.filter(
          (r) =>
            prefs.experimental ||
            getRomCharset(r).stability === 'stable' ||
            r === project.romCharset,
        )
      : [];
  const nameValid = draft.name.trim().length > 0;

  const setColor = (key: keyof LcdColors, value: string) =>
    setDraft({
      ...draft,
      appearance: { palette: CUSTOM_PALETTE_ID, colors: { ...colors, [key]: value.toLowerCase() } },
    });

  const accept = () => {
    if (!nameValid) return;
    if (store.applyProjectSettings(draft)) onClose();
    else setError('dialog.projectSettings.rejected');
  };

  return (
    <Dialog
      open
      title={tk('dialog.projectSettings.title')}
      onClose={onClose}
      initialFocus={`#${CSS.escape(`${ids}-name`)}`}
      testId="project-settings-dialog"
      actions={
        <>
          <button
            type="button"
            className="btn primary"
            onClick={accept}
            disabled={!nameValid}
            data-testid="project-settings-ok"
          >
            {tk('dialog.ok')}
          </button>
          <button type="button" className="btn" onClick={onClose}>
            {tk('dialog.cancel')}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          accept();
        }}
      >
        <div className="row">
          <label htmlFor={`${ids}-name`}>{tk('project.name')}</label>
          <input
            id={`${ids}-name`}
            className="field grow"
            value={draft.name}
            maxLength={LIMITS.nameMaxLength}
            aria-invalid={!nameValid}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
            data-testid="project-name"
          />
        </div>

        <fieldset className="group">
          <legend>{tk('project.group.display')}</legend>
          <p data-testid="project-profile-summary">
            {t(profile.labelKey)} — {project.width} × {project.height} px
          </p>
          <button
            type="button"
            className="btn"
            onClick={() => {
              onClose();
              openDialog('convert');
            }}
          >
            {tk('menu.project.convert')}
          </button>
          {profile.kind === 'character' ? (
            <>
              <div className="row">
                <label htmlFor={`${ids}-rom`}>{tk('project.rom')}</label>
                <select
                  id={`${ids}-rom`}
                  className="field grow"
                  value={draft.romCharset}
                  onChange={(e) =>
                    setDraft({ ...draft, romCharset: e.target.value as RomCharsetId })
                  }
                >
                  {romChoices.map((r) => (
                    <option key={r} value={r}>
                      {t(getRomCharset(r).labelKey)}
                    </option>
                  ))}
                </select>
              </div>
              <p className="hint">{tk('project.rom.hint')}</p>
            </>
          ) : null}
        </fieldset>

        <fieldset className="group" data-testid="project-device">
          <legend>{tk('project.group.device')}</legend>
          <DeviceFields
            profile={profile}
            device={draft.device}
            onChange={(device) => setDraft({ ...draft, device })}
          />
        </fieldset>

        <fieldset className="group">
          <legend>{tk('project.group.appearance')}</legend>
          <div className="row">
            <label htmlFor={`${ids}-palette`}>{tk('project.palette')}</label>
            <select
              id={`${ids}-palette`}
              className="field grow"
              value={paletteId}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  appearance:
                    e.target.value === CUSTOM_PALETTE_ID
                      ? { palette: CUSTOM_PALETTE_ID, colors }
                      : { palette: e.target.value },
                })
              }
            >
              {PALETTES.map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.labelKey)}
                </option>
              ))}
              <option value={CUSTOM_PALETTE_ID}>{tk('palette.custom')}</option>
            </select>
          </div>
          <div className="row">
            {(['screen', 'off', 'on', 'frame'] as const).map((key) => (
              <label key={key} className="check">
                <input
                  type="color"
                  value={colors[key]}
                  onChange={(e) => setColor(key, e.target.value)}
                />
                {tk(`project.color.${key}` as MessageKey)}
              </label>
            ))}
          </div>
          <p className="hint">{tk('project.colorsHint')}</p>
        </fieldset>

        <fieldset className="group">
          <legend>{tk('project.group.playback')}</legend>
          <div className="row">
            <label htmlFor={`${ids}-loop`}>{tk('project.loop')}</label>
            <select
              id={`${ids}-loop`}
              className="field"
              value={draft.loopMode}
              onChange={(e) => setDraft({ ...draft, loopMode: e.target.value as LoopMode })}
            >
              {LOOP_MODES.map((m) => (
                <option key={m} value={m}>
                  {tk(`loop.${m}` as MessageKey)}
                </option>
              ))}
            </select>
          </div>
          <p className="hint">
            {tk('project.memory', {
              frames: project.frames.length,
              bytes: project.frames.length * project.width * project.height,
            })}
          </p>
        </fieldset>
        {error ? (
          <p className="error-text" role="alert">
            {tk(error)}
          </p>
        ) : null}
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}
