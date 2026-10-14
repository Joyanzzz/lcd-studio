import { createContext, useContext, useSyncExternalStore, type ReactNode } from 'react';
import type { Platform } from '../platform/index.ts';
import type { Autosave, SaveStatus } from '../storage/autosave.ts';
import type { Preferences } from '../storage/preferences.ts';
import type { RecoveryStore } from '../storage/recovery-store.ts';
import type { ExportWorkerClient } from '../workers/export-client.ts';
import type { ImageWorkerClient } from '../workers/image-client.ts';
import type { ProjectWorkerClient } from '../workers/project-client.ts';
import type { EditorState, EditorStore } from './state/editor-store.ts';
import type { LimitNotice } from './state/limit-notice.ts';
import type { ToastStore } from './state/toasts.ts';

/** Servicios compartidos por toda la interfaz. */
export interface AppServices {
  readonly store: EditorStore;
  readonly toasts: ToastStore;
  /** Aviso único del límite de caracteres propios. */
  readonly limitNotice: LimitNotice;
  readonly platform: Platform;
  readonly autosave: Autosave;
  readonly recovery: RecoveryStore;
  readonly images: ImageWorkerClient;
  readonly exports: ExportWorkerClient;
  readonly projects: ProjectWorkerClient;
  readonly appVersion: string;
  /** Estado del autoguardado (suscripción externa). */
  readonly saveStatus: { get: () => SaveStatus; subscribe: (l: () => void) => () => void };
  /** Preferencias de la interfaz. */
  readonly preferences: {
    get: () => Preferences;
    subscribe: (l: () => void) => () => void;
    update: (patch: Partial<Preferences>) => void;
  };
}

const ServicesContext = createContext<AppServices | null>(null);

export function ServicesProvider({
  services,
  children,
}: {
  services: AppServices;
  children: ReactNode;
}) {
  return <ServicesContext.Provider value={services}>{children}</ServicesContext.Provider>;
}

export function useServices(): AppServices {
  const s = useContext(ServicesContext);
  if (!s) throw new Error('useServices fuera de ServicesProvider');
  return s;
}

/** Suscripción a una parte del estado del editor. */
export function useEditor<T>(selector: (state: EditorState) => T): T {
  const { store } = useServices();
  return useSyncExternalStore(store.subscribe, () => selector(store.getState()));
}

export function usePreferences(): Preferences {
  const { preferences } = useServices();
  return useSyncExternalStore(preferences.subscribe, preferences.get);
}

export function useSaveStatus(): SaveStatus {
  const { saveStatus } = useServices();
  return useSyncExternalStore(saveStatus.subscribe, saveStatus.get);
}
