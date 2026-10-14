import { useEditor, useServices } from '../app-context.tsx';
import { useI18n } from '../i18n/index.tsx';
import { PixelIcon } from './PixelIcon.tsx';

export interface ToolbarHandlers {
  onNew: () => void;
  onOpen: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onSettings: () => void;
  onHelp: () => void;
}

export function MainToolbar(props: ToolbarHandlers) {
  const { tk, t } = useI18n();
  const { store, platform } = useServices();
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const undoLabel = useEditor((s) => s.undoLabel);
  const redoLabel = useEditor((s) => s.redoLabel);
  const desktop = platform.kind === 'desktop';
  return (
    <div className="main-toolbar" role="toolbar" aria-label={tk('toolbar.label')}>
      <button type="button" className="btn" onClick={props.onNew} title={tk('toolbar.new.tip')}>
        <PixelIcon name="new" />
        <span className="label">{tk('toolbar.new')}</span>
      </button>
      <button type="button" className="btn" onClick={props.onOpen} title={tk('toolbar.open.tip')}>
        <PixelIcon name="open" />
        <span className="label">{tk('toolbar.open')}</span>
      </button>
      <button
        type="button"
        className="btn"
        onClick={props.onSave}
        title={tk(desktop ? 'toolbar.save.tip.desktop' : 'toolbar.save.tip.web')}
      >
        <PixelIcon name="save" />
        <span className="label">{tk('toolbar.save')}</span>
      </button>
      {desktop ? (
        <button
          type="button"
          className="btn"
          onClick={props.onSaveAs}
          title={tk('toolbar.saveAs.tip')}
        >
          <PixelIcon name="saveAs" />
          <span className="label">{tk('toolbar.saveAs')}</span>
        </button>
      ) : null}
      <span className="toolbar-sep" aria-hidden="true" />
      <button
        type="button"
        className="btn icon-only"
        onClick={() => store.undo()}
        disabled={!canUndo}
        aria-label={tk('toolbar.undo')}
        title={
          undoLabel ? tk('toolbar.undo.tip', { action: t(undoLabel) }) : tk('toolbar.undo.none')
        }
      >
        <PixelIcon name="undo" />
      </button>
      <button
        type="button"
        className="btn icon-only"
        onClick={() => store.redo()}
        disabled={!canRedo}
        aria-label={tk('toolbar.redo')}
        title={
          redoLabel ? tk('toolbar.redo.tip', { action: t(redoLabel) }) : tk('toolbar.redo.none')
        }
      >
        <PixelIcon name="redo" />
      </button>
      <span className="spacer" />
      <button type="button" className="btn" onClick={props.onSettings}>
        <PixelIcon name="settings" />
        <span className="label">{tk('toolbar.settings')}</span>
      </button>
      <button type="button" className="btn" onClick={props.onHelp}>
        <PixelIcon name="help" />
        <span className="label">{tk('toolbar.help')}</span>
      </button>
    </div>
  );
}
