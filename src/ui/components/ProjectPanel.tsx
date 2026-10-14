import { useState } from 'react';
import {
  CUSTOM_PALETTE_ID,
  PALETTES,
  resolveColors,
  type LcdColors,
} from '../../core/appearance.ts';
import { LIMITS } from '../../core/limits.ts';
import { LOOP_MODES, type LoopMode } from '../../core/project.ts';
import {
  DISPLAY_PROFILES,
  getProfile,
  getRomCharset,
  profileCanvasSize,
  type RomCharsetId,
} from '../../device-profiles/index.ts';
import { useEditor, usePreferences, useServices } from '../app-context.tsx';
import { useProfile } from '../hooks.ts';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { Dialog } from './Dialog.tsx';

export function ProjectPanel() {
  const { tk, t } = useI18n();
  const { store } = useServices();
  const prefs = usePreferences();
  const project = useEditor((s) => s.project);
  const profile = useProfile();
  const [name, setName] = useState(project.name);
  const [profileId, setProfileId] = useState(project.profileId);
  const [size, setSize] = useState({ width: project.width, height: project.height });
  const [confirm, setConfirm] = useState<null | {
    profileId: string;
    width: number;
    height: number;
  }>(null);

  // Si el proyecto cambia desde fuera (deshacer, abrir…), los borradores se reinician.
  const [source, setSource] = useState(project);
  if (source !== project) {
    setSource(project);
    if (source.name !== project.name) setName(project.name);
    if (
      source.profileId !== project.profileId ||
      source.width !== project.width ||
      source.height !== project.height
    ) {
      setProfileId(project.profileId);
      setSize({ width: project.width, height: project.height });
    }
  }

  const selectedProfile = getProfile(profileId)!;
  const custom = selectedProfile.kind === 'graphic' && !selectedProfile.fixedSize;
  const sizeValid =
    Number.isInteger(size.width) &&
    Number.isInteger(size.height) &&
    size.width >= 1 &&
    size.height >= 1 &&
    size.width <= LIMITS.canvasMaxSide &&
    size.height <= LIMITS.canvasMaxSide;
  const target = profileCanvasSize(selectedProfile, size);
  const changed =
    profileId !== project.profileId ||
    (target && (target.width !== project.width || target.height !== project.height));

  const applyProfile = () => {
    if (!target || (custom && !sizeValid)) return;
    const shrinks = target.width < project.width || target.height < project.height;
    if (shrinks) setConfirm({ profileId, width: target.width, height: target.height });
    else store.changeProfile(profileId, custom ? size : undefined);
  };

  const colors = resolveColors(project.appearance);
  const setColor = (key: keyof LcdColors, value: string) => {
    store.setAppearance({
      palette: CUSTOM_PALETTE_ID,
      colors: { ...colors, [key]: value.toLowerCase() },
    });
  };
  const paletteId = 'colors' in project.appearance ? CUSTOM_PALETTE_ID : project.appearance.palette;
  const romChoices =
    profile.kind === 'character'
      ? profile.romCharsets.filter(
          (r) =>
            prefs.experimental ||
            getRomCharset(r).stability === 'stable' ||
            r === project.romCharset,
        )
      : [];

  return (
    <>
      <div className="row">
        <label htmlFor="project-name">{tk('project.name')}</label>
        <input
          id="project-name"
          className="field grow"
          value={name}
          maxLength={LIMITS.nameMaxLength}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name !== project.name && store.rename(name)}
          onKeyDown={(e) => e.key === 'Enter' && name !== project.name && store.rename(name)}
        />
      </div>

      <fieldset className="group">
        <legend>{tk('project.group.display')}</legend>
        <div className="row">
          <label htmlFor="project-profile">{tk('project.profile')}</label>
          <select
            id="project-profile"
            className="field grow"
            value={profileId}
            onChange={(e) => setProfileId(e.target.value)}
          >
            <optgroup label={tk('profile.group.character')}>
              {DISPLAY_PROFILES.filter((p) => p.kind === 'character').map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.labelKey)}
                </option>
              ))}
            </optgroup>
            <optgroup label={tk('profile.group.graphic')}>
              {DISPLAY_PROFILES.filter((p) => p.kind === 'graphic').map((p) => (
                <option key={p.id} value={p.id}>
                  {t(p.labelKey)}
                </option>
              ))}
            </optgroup>
          </select>
        </div>
        {custom ? (
          <div className="row">
            <label htmlFor="project-width">{tk('project.width')}</label>
            <input
              id="project-width"
              className="field narrow"
              type="number"
              min={1}
              max={LIMITS.canvasMaxSide}
              value={Number.isFinite(size.width) ? size.width : ''}
              aria-invalid={!sizeValid}
              onChange={(e) => setSize({ ...size, width: e.target.valueAsNumber })}
            />
            <label htmlFor="project-height">{tk('project.height')}</label>
            <input
              id="project-height"
              className="field narrow"
              type="number"
              min={1}
              max={LIMITS.canvasMaxSide}
              value={Number.isFinite(size.height) ? size.height : ''}
              aria-invalid={!sizeValid}
              onChange={(e) => setSize({ ...size, height: e.target.valueAsNumber })}
            />
          </div>
        ) : null}
        {custom && !sizeValid ? (
          <p className="error-text" role="alert">
            {tk('limits.canvasSize', {
              width: String(size.width),
              height: String(size.height),
              max: LIMITS.canvasMaxSide,
            })}
          </p>
        ) : null}
        <button
          type="button"
          className="btn"
          disabled={!changed || (custom && !sizeValid)}
          onClick={applyProfile}
        >
          {tk('project.changeProfile')}
        </button>
        {profile.kind === 'character' ? (
          <>
            <div className="row">
              <label htmlFor="project-rom">{tk('project.rom')}</label>
              <select
                id="project-rom"
                className="field grow"
                value={project.romCharset}
                onChange={(e) => store.setRomCharset(e.target.value as RomCharsetId)}
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

      <fieldset className="group">
        <legend>{tk('project.group.appearance')}</legend>
        <div className="row">
          <label htmlFor="project-palette">{tk('project.palette')}</label>
          <select
            id="project-palette"
            className="field grow"
            value={paletteId}
            onChange={(e) =>
              e.target.value === CUSTOM_PALETTE_ID
                ? store.setAppearance({ palette: CUSTOM_PALETTE_ID, colors })
                : store.setAppearance({ palette: e.target.value })
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
          <label htmlFor="project-loop">{tk('project.loop')}</label>
          <select
            id="project-loop"
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
        </div>
        <p className="hint">
          {tk('project.memory', {
            frames: project.frames.length,
            bytes: project.frames.length * project.width * project.height,
          })}
        </p>
      </fieldset>

      <Dialog
        open={confirm !== null}
        title={tk('dialog.profile.title')}
        onClose={() => setConfirm(null)}
        actions={
          <>
            <button
              type="button"
              className="btn primary"
              onClick={() => {
                if (confirm)
                  store.changeProfile(
                    confirm.profileId,
                    custom ? { width: confirm.width, height: confirm.height } : undefined,
                  );
                setConfirm(null);
              }}
            >
              {tk('dialog.ok')}
            </button>
            <button type="button" className="btn" onClick={() => setConfirm(null)}>
              {tk('dialog.cancel')}
            </button>
          </>
        }
      >
        <p>
          {confirm
            ? tk('dialog.profile.message', {
                from: `${project.width} × ${project.height}`,
                to: `${confirm.width} × ${confirm.height}`,
              })
            : ''}
        </p>
      </Dialog>
    </>
  );
}
