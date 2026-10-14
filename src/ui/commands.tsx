import { createContext, useContext, type ReactNode } from 'react';

/** Ventanas emergentes de la aplicación (una abierta como máximo). */
export type DialogId =
  | 'new'
  | 'help'
  | 'settings'
  | 'projectSettings'
  | 'convert'
  | 'export'
  | 'cgramFit'
  | 'diagnostics';

export interface AppCommands {
  /** Abre una ventana emergente; el foco vuelve al control activo al cerrarla. */
  openDialog(id: DialogId): void;
}

const CommandsContext = createContext<AppCommands | null>(null);

export function CommandsProvider({
  commands,
  children,
}: {
  commands: AppCommands;
  children: ReactNode;
}) {
  return <CommandsContext.Provider value={commands}>{children}</CommandsContext.Provider>;
}

export function useCommands(): AppCommands {
  const c = useContext(CommandsContext);
  if (!c) throw new Error('useCommands fuera de CommandsProvider');
  return c;
}
