import { StrictMode, useCallback } from 'react';
import { createRoot } from 'react-dom/client';
import { createProject, type Project } from './core/project.ts';
import { DEFAULT_PROFILE_ID } from './device-profiles/index.ts';
import { createPlatform } from './platform/index.ts';
import { Autosave, type SaveStatus } from './storage/autosave.ts';
import {
  browserStorage,
  loadPreferences,
  savePreferences,
  type Preferences,
} from './storage/preferences.ts';
import { chooseRecovery } from './storage/recovery.ts';
import {
  createIndexedDbRecoveryStore,
  createMemoryRecoveryStore,
  type RecoveryStore,
} from './storage/recovery-store.ts';
import { GENERATOR_NAME } from './ui/app-actions.ts';
import { ServicesProvider, usePreferences, type AppServices } from './ui/app-context.tsx';
import { App } from './ui/App.tsx';
import { en } from './ui/i18n/en.ts';
import { es } from './ui/i18n/es.ts';
import { I18nProvider, type Locale } from './ui/i18n/index.tsx';
import { registerServiceWorker } from './ui/pwa.ts';
import { EditorStore } from './ui/state/editor-store.ts';
import { LimitNotice } from './ui/state/limit-notice.ts';
import { ToastStore } from './ui/state/toasts.ts';
import { ExportWorkerClient } from './workers/export-client.ts';
import { ImageWorkerClient } from './workers/image-client.ts';
import { ProjectWorkerClient } from './workers/project-client.ts';
import './ui/styles/theme.css';
import './ui/styles/app.css';

const APP_VERSION = import.meta.env['VITE_APP_VERSION'] ?? '0.0.0';

function Root({ services }: { services: AppServices }) {
  const prefs = usePreferences();
  const setLocale = useCallback(
    (locale: Locale) => services.preferences.update({ locale }),
    [services],
  );
  return (
    <I18nProvider locale={prefs.locale} setLocale={setLocale}>
      <App />
    </I18nProvider>
  );
}

async function boot(): Promise<void> {
  const storage = browserStorage();
  let prefs: Preferences = loadPreferences(
    storage,
    navigator.languages?.length ? navigator.languages : [navigator.language],
  );
  const prefListeners = new Set<() => void>();
  const dictionary = prefs.locale === 'en' ? en : es;
  const toasts = new ToastStore();
  const platform = await createPlatform();

  let recovery: RecoveryStore;
  try {
    recovery =
      typeof indexedDB === 'undefined'
        ? createMemoryRecoveryStore()
        : createIndexedDbRecoveryStore();
  } catch {
    recovery = createMemoryRecoveryStore();
  }

  const projects = new ProjectWorkerClient(
    () => new Worker(new URL('./workers/project.worker.ts', import.meta.url), { type: 'module' }),
  );

  let initial: Project = createProject({
    name: dictionary['app.defaultProjectName'],
    profileId: DEFAULT_PROFILE_ID,
  });
  let fileDirty = false;
  try {
    const outcome = await chooseRecovery(await recovery.load(), (bytes) => projects.parse(bytes));
    if (outcome.kind === 'recovered') {
      initial = outcome.project;
      fileDirty = outcome.unsavedToFile;
      toasts.push(
        outcome.source === 'current' ? 'info' : 'warning',
        outcome.source === 'current' ? 'toast.recovered' : 'toast.recoveredPrevious',
      );
    }
  } catch {
    toasts.push('error', 'save.errorDetail');
    recovery = createMemoryRecoveryStore();
  }

  const store = new EditorStore(initial, { fileDirty });
  let saveStatus: SaveStatus = 'idle';
  const statusListeners = new Set<() => void>();
  const autosave = new Autosave({
    store: recovery,
    snapshot: async () => {
      const { project, fileDirty: unsavedToFile } = store.getState();
      const bytes = await projects.serialize(project, {
        name: GENERATOR_NAME,
        version: APP_VERSION,
      });
      return { bytes, savedAt: Date.now(), unsavedToFile };
    },
    onStatus: (status) => {
      if (status === 'error' && saveStatus !== 'error') toasts.push('error', 'save.errorDetail');
      saveStatus = status;
      for (const l of statusListeners) l();
    },
  });

  // Cada cambio del proyecto (o de su estado respecto al archivo) programa el autoguardado.
  let lastRevision = store.getState().revision;
  let lastDirty = store.getState().fileDirty;
  store.subscribe(() => {
    const { revision, fileDirty: dirty } = store.getState();
    if (revision !== lastRevision || dirty !== lastDirty) {
      lastRevision = revision;
      lastDirty = dirty;
      autosave.markDirty();
    }
  });

  const services: AppServices = {
    store,
    toasts,
    limitNotice: new LimitNotice(),
    platform,
    autosave,
    recovery,
    images: new ImageWorkerClient(
      () => new Worker(new URL('./workers/image.worker.ts', import.meta.url), { type: 'module' }),
    ),
    projects,
    exports: new ExportWorkerClient(
      () => new Worker(new URL('./workers/export.worker.ts', import.meta.url), { type: 'module' }),
    ),
    appVersion: APP_VERSION,
    saveStatus: {
      get: () => saveStatus,
      subscribe: (l) => {
        statusListeners.add(l);
        return () => statusListeners.delete(l);
      },
    },
    preferences: {
      get: () => prefs,
      subscribe: (l) => {
        prefListeners.add(l);
        return () => prefListeners.delete(l);
      },
      update: (patch) => {
        prefs = { ...prefs, ...patch };
        savePreferences(storage, prefs);
        for (const l of prefListeners) l();
      },
    },
  };

  const container = document.getElementById('root');
  if (!container) throw new Error('Falta #root');
  createRoot(container).render(
    <StrictMode>
      <ServicesProvider services={services}>
        <Root services={services} />
      </ServicesProvider>
    </StrictMode>,
  );

  if (platform.kind === 'web')
    registerServiceWorker(() => toasts.push('success', 'toast.offlineReady'));
}

void boot();
