import { afterEach, describe, expect, it } from 'vitest';
import { issue, ok } from '../../../src/core/errors.ts';
import { createProject } from '../../../src/core/project.ts';
import type { Platform, SaveMode } from '../../../src/platform/types.ts';
import {
  openProject,
  saveProject,
  setLegacySaveConfirm,
  type LegacySaveChoice,
} from '../../../src/ui/app-actions.ts';
import type { AppServices } from '../../../src/ui/app-context.tsx';
import { EditorStore } from '../../../src/ui/state/editor-store.ts';
import { ToastStore } from '../../../src/ui/state/toasts.ts';

function services(kind: 'web' | 'desktop', warning: string | null) {
  const saves: SaveMode[] = [];
  const project = createProject({ name: 'Antiguo', profileId: 'hd44780-16x2' });
  const platform: Partial<Platform> = {
    kind,
    openProject: async () => ({ name: 'antiguo.lcdstudio.json', bytes: new Uint8Array([1]) }),
    acceptOpenedProject: async () => undefined,
    saveProject: async (_bytes, name, mode) => {
      saves.push(mode);
      return { name };
    },
  };
  const s = {
    store: new EditorStore(createProject({ name: 'Actual', profileId: 'hd44780-16x2' })),
    toasts: new ToastStore(),
    platform,
    autosave: { markDirty: () => undefined },
    appVersion: 'test',
    projects: {
      parse: async () => ok(project, warning ? [issue(warning)] : []),
      serialize: async () => new Uint8Array([7]),
    },
  } as unknown as AppServices;
  return { s, saves };
}

afterEach(() => setLegacySaveConfirm(null));

describe('archivos de formato anterior', () => {
  it('un proyecto v2 se abre como pendiente de guardar y recuerda su formato', async () => {
    const { s } = services('desktop', 'migration.fromV2');
    expect(await openProject(s, 'migrado')).toBe(true);
    expect(s.store.getState()).toMatchObject({ fileDirty: true, legacyFormat: 2 });
    const current = services('desktop', null);
    await openProject(current.s, 'migrado');
    expect(current.s.store.getState()).toMatchObject({ fileDirty: false, legacyFormat: null });
  });

  it('en escritorio, «Guardar» pregunta antes de sobrescribir y permite guardar una copia', async () => {
    const asked: number[] = [];
    let answer: LegacySaveChoice = 'cancel';
    setLegacySaveConfirm(async (version) => {
      asked.push(version);
      return answer;
    });
    const { s, saves } = services('desktop', 'migration.fromV1');
    await openProject(s, 'migrado');
    expect(s.store.getState().legacyFormat).toBe(1);

    expect(await saveProject(s, 'save')).toBe(false);
    expect(saves).toEqual([]);
    expect(s.store.getState().legacyFormat).toBe(1);

    answer = 'copy';
    expect(await saveProject(s, 'save')).toBe(true);
    expect(saves).toEqual(['saveAs']);
    expect(asked).toEqual([1, 1]);
    // Ya guardado en el formato actual: no vuelve a preguntar.
    expect(s.store.getState()).toMatchObject({ fileDirty: false, legacyFormat: null });
    expect(await saveProject(s, 'save')).toBe(true);
    expect(saves).toEqual(['saveAs', 'save']);
    expect(asked).toEqual([1, 1]);
  });

  it('«Sobrescribir» guarda encima, y sin diálogo registrado se guarda una copia', async () => {
    setLegacySaveConfirm(async () => 'overwrite');
    const a = services('desktop', 'migration.fromV2');
    await openProject(a.s, 'migrado');
    await saveProject(a.s, 'save');
    expect(a.saves).toEqual(['save']);

    setLegacySaveConfirm(null);
    const b = services('desktop', 'migration.fromV2');
    await openProject(b.s, 'migrado');
    await saveProject(b.s, 'save');
    expect(b.saves).toEqual(['saveAs']);
  });

  it('en web siempre se descarga una copia nueva: no hace falta preguntar', async () => {
    const asked: number[] = [];
    setLegacySaveConfirm(async (v) => {
      asked.push(v);
      return 'cancel';
    });
    const { s, saves } = services('web', 'migration.fromV2');
    await openProject(s, 'migrado');
    expect(await saveProject(s, 'save')).toBe(true);
    expect(saves).toEqual(['save']);
    expect(asked).toEqual([]);
  });
});
