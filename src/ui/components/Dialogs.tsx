import { usePreferences, useServices } from '../app-context.tsx';
import { LOCALES, useI18n, type Locale } from '../i18n/index.tsx';
import type { ThemePreference } from '../../storage/preferences.ts';
import { Dialog } from './Dialog.tsx';

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
  [['P', 'E', 'L', 'R', 'C', 'F', 'T', 'S', 'G'], 'shortcut.tools'],
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
