import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { newProject, openProject, saveProject } from './app-actions.ts';
import { useEditor, usePreferences, useServices } from './app-context.tsx';
import { CommandsProvider, type DialogId } from './commands.tsx';
import { CgramFitDialog } from './components/CgramFitDialog.tsx';
import { ConvertDialog } from './components/ConvertDialog.tsx';
import { DiagnosticsDialog } from './components/DiagnosticsDialog.tsx';
import { HelpDialog, SettingsDialog, UnsavedDialog } from './components/Dialogs.tsx';
import { NewProjectWizard } from './components/ProjectSetup.tsx';
import { ExportDialog } from './components/ExportDialog.tsx';
import { MenuBar, type Menu } from './components/MenuBar.tsx';
import { PixelIcon } from './components/PixelIcon.tsx';
import { ProjectSettingsDialog } from './components/ProjectSettingsDialog.tsx';
import { SidePanels, type PanelId } from './components/SidePanels.tsx';
import { Stage } from './components/Stage.tsx';
import { Timeline } from './components/Timeline.tsx';
import { TitleBar } from './components/TitleBar.tsx';
import { Toasts } from './components/Toasts.tsx';
import { ToolBox, TOOL_KEYS } from './components/ToolBox.tsx';
import { useI18n } from './i18n/index.tsx';
import { onUpdateAvailable, applyUpdate } from './pwa.ts';
import { useProfile } from './hooks.ts';
import { TOOLS } from './state/editor-store.ts';

/** En pantallas estrechas el panel lateral empieza retraído. */
const wideQuery = '(min-width: 1024px)';

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName);
}

function useSystemDark(): boolean {
  const query =
    typeof matchMedia === 'undefined' ? null : matchMedia('(prefers-color-scheme: dark)');
  const [dark, setDark] = useState(query?.matches ?? false);
  useEffect(() => {
    if (!query) return undefined;
    const onChange = () => setDark(query.matches);
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [query]);
  return dark;
}

export function App() {
  const services = useServices();
  const { store, platform, autosave, toasts, limitNotice } = services;
  const { tk, locale } = useI18n();
  const prefs = usePreferences();
  const systemDark = useSystemDark();
  const resolvedTheme = prefs.theme === 'system' ? (systemDark ? 'dark' : 'light') : prefs.theme;
  const projectName = useEditor((s) => s.project.name);
  const fileDirty = useEditor((s) => s.fileDirty);
  const [panel, setPanel] = useState<PanelId>('draw');
  const [sideOpen, setSideOpen] = useState(
    () => typeof matchMedia === 'undefined' || matchMedia(wideQuery).matches,
  );
  const profile = useProfile();
  const hasSelection = useEditor((s) => s.selection !== null);
  const hasClipboard = useEditor((s) => s.clipboard !== null);
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const [dialog, setDialog] = useState<DialogId | null>(null);
  const commands = useMemo(() => ({ openDialog: (id: DialogId) => setDialog(id) }), []);
  const [unsaved, setUnsaved] = useState<((choice: 'save' | 'discard' | 'cancel') => void) | null>(
    null,
  );
  const [updateReady, setUpdateReady] = useState(false);
  const [waitingSave, setWaitingSave] = useState(false);
  const openRef = useRef<() => void>(() => undefined);

  // Tema e idioma del documento.
  useEffect(() => {
    document.documentElement.dataset['theme'] = resolvedTheme;
  }, [resolvedTheme]);
  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);
  useEffect(() => {
    platform.setTitle(`${projectName}${fileDirty ? ' *' : ''} — LCD Studio`);
  }, [platform, projectName, fileDirty]);

  // Mensajes del almacén → notificaciones.
  useEffect(
    () =>
      store.onEvent((event) => {
        if (event.type === 'limit') {
          limitNotice.handle(event.phase);
          return;
        }
        toasts.push(
          event.type === 'error' ? 'error' : (event.kind ?? 'warning'),
          event.code,
          event.params,
        );
      }),
    [store, toasts, limitNotice],
  );
  useEffect(() => () => limitNotice.dismiss(), [limitNotice]);

  /** Pregunta qué hacer con los cambios sin guardar en archivo. */
  const confirmUnsaved = useCallback(
    () =>
      new Promise<'save' | 'discard' | 'cancel'>((resolve) => {
        if (!store.getState().fileDirty) {
          resolve('discard');
          return;
        }
        setUnsaved(() => (choice: 'save' | 'discard' | 'cancel') => {
          setUnsaved(null);
          resolve(choice);
        });
      }),
    [store],
  );

  const guarded = useCallback(
    async (action: () => unknown) => {
      const choice = await confirmUnsaved();
      if (choice === 'cancel') return;
      if (choice === 'save' && !(await saveProject(services, 'save'))) return;
      await action();
    },
    [confirmUnsaved, services],
  );

  const handleOpen = useCallback(() => {
    void guarded(() => openProject(services, tk('app.migratedProjectName')));
  }, [guarded, services, tk]);
  useEffect(() => {
    openRef.current = handleOpen;
  }, [handleOpen]);

  // Web: aviso del navegador si hay cambios que aún no se persistieron.
  useEffect(() => {
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      if (autosave.hasUnpersistedChanges || autosave.currentStatus === 'error') {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [autosave]);

  // Escritorio: confirmación al cerrar la ventana.
  useEffect(
    () =>
      platform.onCloseRequested(async () => {
        await autosave.flush();
        const choice = await confirmUnsaved();
        if (choice === 'cancel') return false;
        if (choice === 'save') return saveProject(services, 'save');
        return true;
      }),
    [platform, autosave, confirmUnsaved, services],
  );

  // Nueva versión disponible (PWA).
  useEffect(() => onUpdateAvailable(() => setUpdateReady(true)), []);
  const doUpdate = async () => {
    setWaitingSave(true);
    await autosave.flush();
    if (autosave.hasUnpersistedChanges) {
      setWaitingSave(false);
      toasts.push('error', 'save.errorDetail');
      return;
    }
    applyUpdate();
  };

  // Atajos globales.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (document.querySelector('dialog[open]')) return;
      const typing = isTyping(e.target);
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && !e.altKey) {
        if (key === 's') {
          e.preventDefault();
          void saveProject(services, e.shiftKey && platform.kind === 'desktop' ? 'saveAs' : 'save');
          return;
        }
        if (key === 'o') {
          e.preventDefault();
          openRef.current();
          return;
        }
        if (key === 'e') {
          e.preventDefault();
          setDialog('export');
          return;
        }
        if (typing) return;
        if (key === 'z') {
          e.preventDefault();
          if (e.shiftKey) store.redo();
          else store.undo();
        } else if (key === 'y') {
          e.preventDefault();
          store.redo();
        } else if (key === 'a') {
          e.preventDefault();
          store.selectAll();
        } else if (key === 'c') {
          if (store.copy()) {
            e.preventDefault();
            toasts.push('info', 'toast.copied');
          }
        } else if (key === 'x') {
          if (store.cut()) {
            e.preventDefault();
            toasts.push('info', 'toast.cut');
          }
        } else if (key === 'v') {
          // Sin contenido interno se deja pasar el pegado nativo (imágenes).
          if (store.getState().clipboard && store.paste()) e.preventDefault();
        }
        return;
      }
      if (mod && e.altKey && key === 'n') {
        e.preventDefault();
        void guarded(() => setDialog('new'));
        return;
      }
      if (typing || e.altKey || mod) return;
      const tool = TOOLS.find((id) => TOOL_KEYS[id].toLowerCase() === key);
      const focused = document.activeElement;
      const onBody = !focused || focused === document.body;
      if (tool) {
        store.setTool(tool);
      } else if (e.key === ' ' && onBody) {
        e.preventDefault();
        store.togglePlay();
      } else if (key === 'o') {
        store.setOnion({ enabled: !store.getState().onion.enabled });
      } else if (e.key === ',') {
        store.selectFrame(store.getState().current - 1);
      } else if (e.key === '.') {
        store.selectFrame(store.getState().current + 1);
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        if (store.deleteSelection()) e.preventDefault();
      } else if (e.key === 'Escape') {
        if (limitNotice.getState().visible) limitNotice.dismiss();
        else if (store.getState().preview) store.setPreview(null);
        else store.deselect();
      } else if (e.key.startsWith('Arrow') && onBody) {
        e.preventDefault();
        const dx = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : 0;
        const dy = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
        if (!store.nudgeSelection(dx, dy)) store.shift(dx, dy);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [store, services, platform.kind, toasts, guarded, limitNotice]);

  const desktop = platform.kind === 'desktop';
  const menus: Menu[] = [
    {
      id: 'file',
      labelKey: 'menu.file',
      items: [
        {
          id: 'new',
          labelKey: 'menu.file.new',
          icon: 'new',
          shortcut: 'Ctrl+Alt+N',
          run: () => void guarded(() => setDialog('new')),
        },
        {
          id: 'open',
          labelKey: 'menu.file.open',
          icon: 'open',
          shortcut: 'Ctrl+O',
          run: handleOpen,
        },
        {
          id: 'save',
          labelKey: desktop ? 'menu.file.save' : 'menu.file.download',
          icon: 'save',
          shortcut: 'Ctrl+S',
          separatorBefore: true,
          run: () => void saveProject(services, 'save'),
        },
        {
          id: 'saveAs',
          labelKey: 'menu.file.saveAs',
          icon: 'saveAs',
          shortcut: 'Ctrl+Shift+S',
          hidden: !desktop,
          run: () => void saveProject(services, 'saveAs'),
        },
        {
          id: 'settings',
          labelKey: 'menu.file.preferences',
          icon: 'settings',
          separatorBefore: true,
          run: () => setDialog('settings'),
        },
      ],
    },
    {
      id: 'edit',
      labelKey: 'menu.edit',
      items: [
        {
          id: 'undo',
          labelKey: 'toolbar.undo',
          icon: 'undo',
          shortcut: 'Ctrl+Z',
          disabled: !canUndo,
          run: () => store.undo(),
        },
        {
          id: 'redo',
          labelKey: 'toolbar.redo',
          icon: 'redo',
          shortcut: 'Ctrl+Y',
          disabled: !canRedo,
          run: () => store.redo(),
        },
        {
          id: 'cut',
          labelKey: 'draw.cut',
          shortcut: 'Ctrl+X',
          separatorBefore: true,
          disabled: !hasSelection,
          run: () => store.cut() && toasts.push('info', 'toast.cut'),
        },
        {
          id: 'copy',
          labelKey: 'draw.copy',
          shortcut: 'Ctrl+C',
          disabled: !hasSelection,
          run: () => store.copy() && toasts.push('info', 'toast.copied'),
        },
        {
          id: 'paste',
          labelKey: 'draw.paste',
          shortcut: 'Ctrl+V',
          disabled: !hasClipboard,
          run: () => store.paste(),
        },
        {
          id: 'selectAll',
          labelKey: 'draw.selectAll',
          shortcut: 'Ctrl+A',
          separatorBefore: true,
          run: () => store.selectAll(),
        },
        {
          id: 'deselect',
          labelKey: 'draw.deselect',
          disabled: !hasSelection,
          run: () => store.deselect(),
        },
      ],
    },
    {
      id: 'project',
      labelKey: 'menu.project',
      items: [
        {
          id: 'projectSettings',
          labelKey: 'menu.project.settings',
          icon: 'settings',
          run: () => setDialog('projectSettings'),
        },
        {
          id: 'convert',
          labelKey: 'menu.project.convert',
          icon: 'lcd',
          run: () => setDialog('convert'),
        },
        {
          id: 'cgramFit',
          labelKey: 'draw.cgramFit',
          separatorBefore: true,
          hidden: profile.kind !== 'character',
          run: () => setDialog('cgramFit'),
        },
        {
          id: 'diagnostics',
          labelKey: 'menu.project.diagnostics',
          separatorBefore: true,
          hidden: profile.kind !== 'led-matrix',
          run: () => setDialog('diagnostics'),
        },
      ],
    },
    {
      id: 'export',
      labelKey: 'menu.export',
      items: [
        {
          id: 'export',
          labelKey: 'menu.export.wizard',
          icon: 'export',
          shortcut: 'Ctrl+E',
          run: () => setDialog('export'),
        },
      ],
    },
    {
      id: 'help',
      labelKey: 'menu.help',
      items: [
        { id: 'help', labelKey: 'menu.help.shortcuts', icon: 'help', run: () => setDialog('help') },
      ],
    },
  ];

  return (
    <CommandsProvider commands={commands}>
      <div className="app" data-side={sideOpen ? 'open' : 'closed'}>
        <a className="skip-link" href="#editor">
          {tk('app.skipToEditor')}
        </a>
        <TitleBar resolvedTheme={resolvedTheme} />
        <div>
          {updateReady ? (
            <div className="update-bar" role="alert">
              <PixelIcon name="info" />
              <span>
                {waitingSave ? tk('dialog.update.waitSave') : tk('dialog.update.message')}
              </span>
              <button
                type="button"
                className="btn primary"
                onClick={() => void doUpdate()}
                disabled={waitingSave}
              >
                {tk('dialog.update.reload')}
              </button>
              <button type="button" className="btn" onClick={() => setUpdateReady(false)}>
                {tk('dialog.update.later')}
              </button>
            </div>
          ) : null}
          <MenuBar menus={menus} />
        </div>
        <main className="workspace">
          <ToolBox />
          <Stage sideOpen={sideOpen} onToggleSide={() => setSideOpen((o) => !o)} />
          <SidePanels
            active={panel}
            onChange={(id) => {
              setPanel(id);
              setSideOpen(true);
            }}
            open={sideOpen}
            onClose={() => setSideOpen(false)}
          />
        </main>
        <Timeline />
        <NewProjectWizard
          open={dialog === 'new'}
          onClose={() => setDialog(null)}
          onCreate={(options) => {
            if (newProject(services, options)) setDialog(null);
          }}
        />
        <ProjectSettingsDialog
          open={dialog === 'projectSettings'}
          onClose={() => setDialog(null)}
        />
        <ExportDialog open={dialog === 'export'} onClose={() => setDialog(null)} />
        <ConvertDialog open={dialog === 'convert'} onClose={() => setDialog(null)} />
        <DiagnosticsDialog open={dialog === 'diagnostics'} onClose={() => setDialog(null)} />
        <SettingsDialog open={dialog === 'settings'} onClose={() => setDialog(null)} />
        <HelpDialog open={dialog === 'help'} onClose={() => setDialog(null)} />
        <UnsavedDialog
          open={unsaved !== null}
          onSave={() => unsaved?.('save')}
          onDiscard={() => unsaved?.('discard')}
          onCancel={() => unsaved?.('cancel')}
        />
        <CgramFitDialog open={dialog === 'cgramFit'} onClose={() => setDialog(null)} />
        <Toasts />
      </div>
    </CommandsProvider>
  );
}
