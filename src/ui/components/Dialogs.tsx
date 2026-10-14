import { useState } from 'react';
import { LIMITS } from '../../core/limits.ts';
import { DEFAULT_PROFILE_ID, DISPLAY_PROFILES, getProfile } from '../../device-profiles/index.ts';
import { usePreferences, useServices } from '../app-context.tsx';
import { LOCALES, useI18n, type Locale } from '../i18n/index.tsx';
import type { ThemePreference } from '../../storage/preferences.ts';
import { Dialog } from './Dialog.tsx';

export function NewProjectDialog(props: {
  open: boolean;
  onClose: () => void;
  onCreate: (options: { name: string; profileId: string; width?: number; height?: number }) => void;
}) {
  const { tk, t } = useI18n();
  const [name, setName] = useState('');
  const [profileId, setProfileId] = useState(DEFAULT_PROFILE_ID);
  const [width, setWidth] = useState(128);
  const [height, setHeight] = useState(64);
  const profile = getProfile(profileId)!;
  const custom = profile.kind === 'graphic' && !profile.fixedSize;
  const valid =
    !custom ||
    (Number.isInteger(width) &&
      Number.isInteger(height) &&
      width >= 1 &&
      height >= 1 &&
      width <= LIMITS.canvasMaxSide &&
      height <= LIMITS.canvasMaxSide);
  const create = () => {
    if (!valid) return;
    props.onCreate({
      name: name.trim() || tk('app.defaultProjectName'),
      profileId,
      ...(custom ? { width, height } : {}),
    });
  };
  return (
    <Dialog
      open={props.open}
      title={tk('dialog.new.title')}
      onClose={props.onClose}
      initialFocus="#new-name"
      testId="new-dialog"
      actions={
        <>
          <button
            type="button"
            className="btn primary"
            disabled={!valid}
            onClick={create}
            data-testid="new-create"
          >
            {tk('dialog.new.create')}
          </button>
          <button type="button" className="btn" onClick={props.onClose}>
            {tk('dialog.cancel')}
          </button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          create();
        }}
      >
        <div className="row">
          <label htmlFor="new-name">{tk('project.name')}</label>
          <input
            id="new-name"
            className="field grow"
            maxLength={LIMITS.nameMaxLength}
            value={name}
            placeholder={tk('app.defaultProjectName')}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="row">
          <label htmlFor="new-profile">{tk('project.profile')}</label>
          <select
            id="new-profile"
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
            <label htmlFor="new-width">{tk('project.width')}</label>
            <input
              id="new-width"
              className="field narrow"
              type="number"
              min={1}
              max={LIMITS.canvasMaxSide}
              value={Number.isFinite(width) ? width : ''}
              aria-invalid={!valid}
              onChange={(e) => setWidth(e.target.valueAsNumber)}
            />
            <label htmlFor="new-height">{tk('project.height')}</label>
            <input
              id="new-height"
              className="field narrow"
              type="number"
              min={1}
              max={LIMITS.canvasMaxSide}
              value={Number.isFinite(height) ? height : ''}
              aria-invalid={!valid}
              onChange={(e) => setHeight(e.target.valueAsNumber)}
            />
          </div>
        ) : null}
        {!valid ? (
          <p className="error-text" role="alert">
            {tk('limits.canvasSize', {
              width: String(width),
              height: String(height),
              max: LIMITS.canvasMaxSide,
            })}
          </p>
        ) : null}
        <p className="hint">{tk('dialog.new.unsaved')}</p>
        <button type="submit" hidden />
      </form>
    </Dialog>
  );
}

export function SettingsDialog(props: { open: boolean; onClose: () => void }) {
  const { tk, t } = useI18n();
  const prefs = usePreferences();
  const { preferences } = useServices();
  return (
    <Dialog
      open={props.open}
      title={tk('dialog.settings.title')}
      onClose={props.onClose}
      testId="settings-dialog"
      actions={
        <button type="button" className="btn primary" onClick={props.onClose}>
          {tk('dialog.ok')}
        </button>
      }
    >
      <div className="row">
        <label htmlFor="settings-language">{tk('dialog.settings.language')}</label>
        <select
          id="settings-language"
          className="field"
          value={prefs.locale}
          onChange={(e) => preferences.update({ locale: e.target.value as Locale })}
        >
          {LOCALES.map((l) => (
            <option key={l} value={l} lang={l}>
              {t(`language.${l}`)}
            </option>
          ))}
        </select>
      </div>
      <div className="row">
        <label htmlFor="settings-theme">{tk('dialog.settings.theme')}</label>
        <select
          id="settings-theme"
          className="field"
          value={prefs.theme}
          onChange={(e) => preferences.update({ theme: e.target.value as ThemePreference })}
        >
          <option value="system">{tk('dialog.settings.theme.system')}</option>
          <option value="light">{tk('dialog.settings.theme.light')}</option>
          <option value="dark">{tk('dialog.settings.theme.dark')}</option>
        </select>
      </div>
      <label className="check">
        <input
          type="checkbox"
          checked={prefs.experimental}
          data-testid="experimental"
          onChange={(e) => preferences.update({ experimental: e.target.checked })}
          aria-describedby="settings-exp-hint"
        />
        {tk('dialog.settings.experimental')}
      </label>
      <p id="settings-exp-hint" className="hint">
        {tk('dialog.settings.experimental.hint')}
      </p>
      <p className="hint">{tk('dialog.settings.privacy')}</p>
    </Dialog>
  );
}

const SHORTCUTS: readonly [readonly string[], string][] = [
  [['P', 'E', 'L', 'R', 'C', 'F', 'T', 'S'], 'shortcut.tools'],
  [['Ctrl+Z', 'Ctrl+Y'], 'shortcut.undoRedo'],
  [['Ctrl+S', 'Ctrl+O'], 'shortcut.save'],
  [[',', '.'], 'shortcut.frames'],
  [['@key.space'], 'shortcut.play'],
  [['O'], 'shortcut.onion'],
  [['← ↑ → ↓'], 'shortcut.shift'],
  [['Ctrl+C', 'Ctrl+X', 'Ctrl+V'], 'shortcut.clipboard'],
  [['@key.delete'], 'shortcut.delete'],
  [['@key.escape'], 'shortcut.escape'],
  [['Alt+← →'], 'shortcut.reorder'],
];

export function HelpDialog(props: { open: boolean; onClose: () => void }) {
  const { tk, t } = useI18n();
  const { appVersion } = useServices();
  // Las teclas con nombre (prefijo @) se traducen; las combinaciones se muestran tal cual.
  const keyName = (k: string) => (k.startsWith('@') ? t(k.slice(1)) : k);
  return (
    <Dialog
      open={props.open}
      title={tk('dialog.help.title')}
      onClose={props.onClose}
      testId="help-dialog"
      actions={
        <button type="button" className="btn primary" onClick={props.onClose}>
          {tk('dialog.ok')}
        </button>
      }
    >
      <p>{tk('dialog.help.intro')}</p>
      <table className="shortcut-table">
        <caption className="visually-hidden">{tk('dialog.help.shortcuts')}</caption>
        <tbody>
          {SHORTCUTS.map(([keys, label]) => (
            <tr key={label}>
              <th scope="row">
                {keys.map((k) => (
                  <kbd key={k}>{keyName(k)}</kbd>
                ))}
              </th>
              <td>{t(label)}</td>
            </tr>
          ))}
          <tr>
            <th scope="row">{tk('key.rightClick')}</th>
            <td>{tk('shortcut.rightClick')}</td>
          </tr>
          <tr>
            <th scope="row">
              <kbd>{tk('key.shift')}</kbd>
            </th>
            <td>{tk('shortcut.shiftKey')}</td>
          </tr>
        </tbody>
      </table>
      <p>{tk('shortcut.canvasKeys')}</p>
      <p className="hint">{tk('dialog.settings.privacy')}</p>
      <p className="hint">{tk('dialog.help.version', { version: appVersion })}</p>
    </Dialog>
  );
}

export function UnsavedDialog(props: {
  open: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onCancel: () => void;
}) {
  const { tk } = useI18n();
  return (
    <Dialog
      open={props.open}
      title={tk('dialog.unsaved.title')}
      onClose={props.onCancel}
      testId="unsaved-dialog"
      actions={
        <>
          <button type="button" className="btn primary" onClick={props.onSave}>
            {tk('dialog.unsaved.save')}
          </button>
          <button type="button" className="btn" onClick={props.onDiscard}>
            {tk('dialog.unsaved.discard')}
          </button>
          <button type="button" className="btn" onClick={props.onCancel}>
            {tk('dialog.cancel')}
          </button>
        </>
      }
    >
      <p>{tk('dialog.unsaved.message')}</p>
    </Dialog>
  );
}
