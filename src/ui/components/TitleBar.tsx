import { useEditor, usePreferences, useSaveStatus, useServices } from '../app-context.tsx';
import { LOCALES, useI18n, type Locale } from '../i18n/index.tsx';
import { PixelIcon } from './PixelIcon.tsx';

export function TitleBar({ resolvedTheme }: { resolvedTheme: 'light' | 'dark' }) {
  const { tk, t } = useI18n();
  const name = useEditor((s) => s.project.name);
  const fileDirty = useEditor((s) => s.fileDirty);
  const status = useSaveStatus();
  const prefs = usePreferences();
  const { preferences } = useServices();
  const statusKey = `save.status.${status}` as const;
  return (
    <header className="titlebar">
      <PixelIcon name="lcd" />
      <h1>
        {tk('app.name')} — {name}
        {fileDirty ? ` (${tk('title.modified')})` : ''}
      </h1>
      <span
        className="save-status"
        data-status={status}
        data-testid="save-status"
        role="status"
        aria-label={tk('save.status.label', { status: t(statusKey) })}
      >
        {status === 'error' ? (
          <PixelIcon name="error" />
        ) : status === 'saved' ? (
          <PixelIcon name="check" />
        ) : null}
        {t(statusKey)}
      </span>
      <label className="visually-hidden" htmlFor="language-select">
        {tk('toolbar.language')}
      </label>
      <select
        id="language-select"
        className="field"
        value={prefs.locale}
        onChange={(e) => preferences.update({ locale: e.target.value as Locale })}
        title={tk('toolbar.language')}
      >
        {LOCALES.map((l) => (
          <option key={l} value={l} lang={l}>
            {t(`language.${l}`)}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="btn"
        data-testid="theme-toggle"
        onClick={() => preferences.update({ theme: resolvedTheme === 'dark' ? 'light' : 'dark' })}
      >
        <PixelIcon name={resolvedTheme === 'dark' ? 'sun' : 'moon'} />
        <span className="label">
          {tk(resolvedTheme === 'dark' ? 'toolbar.theme.toLight' : 'toolbar.theme.toDark')}
        </span>
      </button>
    </header>
  );
}
