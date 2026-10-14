import { describe, expect, it, vi } from 'vitest';
import { serializeProject } from '../../../src/core/project-format.ts';
import { createProject } from '../../../src/core/project.ts';
import { Autosave, type SaveStatus } from '../../../src/storage/autosave.ts';
import {
  browserStorage,
  loadPreferences,
  PREFERENCES_KEY,
  savePreferences,
  type KeyValueStorage,
} from '../../../src/storage/preferences.ts';
import { parseProjectFile } from '../../../src/core/project-format.ts';
import { chooseRecovery } from '../../../src/storage/recovery.ts';
import {
  createMemoryRecoveryStore,
  type RecoveryRecord,
} from '../../../src/storage/recovery-store.ts';

const GEN = { name: 'LCD Studio', version: 'test' };
const record = (name: string, savedAt = 1): RecoveryRecord => ({
  bytes: serializeProject(createProject({ name, profileId: 'hd44780-16x2' }), GEN),
  savedAt,
  unsavedToFile: true,
});

function manualTimers() {
  const queue: (() => void)[] = [];
  return {
    setTimer: (fn: () => void) => {
      queue.push(fn);
      return queue.length;
    },
    clearTimer: () => {
      queue.length = 0;
    },
    fire: () => {
      const fns = queue.splice(0);
      for (const fn of fns) fn();
    },
  };
}

describe('almacén de recuperación', () => {
  it('conserva el último estado y la copia anterior', async () => {
    const store = createMemoryRecoveryStore();
    await store.save(record('uno', 1));
    await store.save(record('dos', 2));
    await store.save(record('tres', 3));
    const snap = await store.load();
    expect(snap.current?.savedAt).toBe(3);
    expect(snap.previous?.savedAt).toBe(2);
    await store.clear();
    expect(await store.load()).toEqual({});
  });

  it('recupera la copia actual o, si está dañada, la anterior', async () => {
    const good = record('Bueno');
    const damaged: RecoveryRecord = { ...good, bytes: good.bytes.slice(0, 40) };
    const a = await chooseRecovery({ current: good }, parseProjectFile);
    expect(a.kind === 'recovered' && a.source === 'current' && a.project.name === 'Bueno').toBe(
      true,
    );
    const b = await chooseRecovery(
      { current: damaged, previous: record('Anterior') },
      parseProjectFile,
    );
    expect(b.kind === 'recovered' && b.source === 'previous' && b.project.name === 'Anterior').toBe(
      true,
    );
    expect(await chooseRecovery({ current: damaged }, parseProjectFile)).toEqual({ kind: 'none' });
    expect(await chooseRecovery({}, parseProjectFile)).toEqual({ kind: 'none' });
  });
});

describe('autoguardado', () => {
  it('agrupa cambios, informa del estado y guarda la última versión', async () => {
    const store = createMemoryRecoveryStore();
    const timers = manualTimers();
    const statuses: SaveStatus[] = [];
    let n = 0;
    const autosave = new Autosave({
      store,
      snapshot: () => record(`v${++n}`, n),
      onStatus: (s) => statuses.push(s),
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });
    autosave.markDirty();
    autosave.markDirty();
    expect(autosave.hasUnpersistedChanges).toBe(true);
    expect(autosave.currentStatus).toBe('pending');
    timers.fire();
    await autosave.flush();
    expect(statuses).toEqual(['pending', 'pending', 'saving', 'saved']);
    expect(autosave.hasUnpersistedChanges).toBe(false);
    expect((await store.load()).current?.savedAt).toBe(1);
    autosave.dispose();
  });

  it('informa visiblemente si el guardado falla y reintenta después', async () => {
    const store = createMemoryRecoveryStore();
    const timers = manualTimers();
    const errors: unknown[] = [];
    const autosave = new Autosave({
      store,
      snapshot: () => record('x'),
      onStatus: (s, e) => {
        if (s === 'error') errors.push(e);
      },
      setTimer: timers.setTimer,
      clearTimer: timers.clearTimer,
    });
    store.failNext = true;
    autosave.markDirty();
    await autosave.flush();
    expect(autosave.currentStatus).toBe('error');
    expect(errors).toHaveLength(1);
    expect(autosave.hasUnpersistedChanges).toBe(true);
    await autosave.flush();
    expect(autosave.currentStatus).toBe('saved');
  });

  it('flush sin cambios no escribe y markClean descarta lo pendiente', async () => {
    const store = createMemoryRecoveryStore();
    const save = vi.spyOn(store, 'save');
    const autosave = new Autosave({ store, snapshot: () => record('x'), delayMs: 5 });
    await autosave.flush();
    expect(save).not.toHaveBeenCalled();
    autosave.markDirty();
    autosave.markClean();
    expect(autosave.hasUnpersistedChanges).toBe(false);
    expect(autosave.currentStatus).toBe('idle');
    autosave.markDirty();
    await new Promise((r) => setTimeout(r, 30));
    expect(save).toHaveBeenCalledTimes(1);
    autosave.dispose();
  });
});

describe('preferencias', () => {
  const memory = (): KeyValueStorage & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it('detecta el idioma solo en el primer inicio y lo guarda', () => {
    const storage = memory();
    const first = loadPreferences(storage, ['en-GB']);
    expect(first.locale).toBe('en');
    expect(JSON.parse(storage.data.get(PREFERENCES_KEY)!).locale).toBe('en');
    // Aunque el sistema cambie, se respeta la preferencia guardada.
    expect(loadPreferences(storage, ['es-ES']).locale).toBe('en');
    savePreferences(storage, { ...first, locale: 'es' });
    expect(loadPreferences(storage, ['en-US']).locale).toBe('es');
  });

  it('usa español si el sistema no está en español ni en inglés', () => {
    expect(loadPreferences(memory(), ['ja-JP']).locale).toBe('es');
  });

  it('ignora datos dañados o con tipos incorrectos', () => {
    const storage = memory();
    storage.data.set(PREFERENCES_KEY, '{roto');
    expect(loadPreferences(storage, []).theme).toBe('system');
    storage.data.set(
      PREFERENCES_KEY,
      JSON.stringify({
        locale: 'fr',
        theme: 'neon',
        experimental: 'sí',
        grid: 0,
        exportOptions: [],
        exporter: 5,
      }),
    );
    const p = loadPreferences(storage, ['es']);
    expect(p).toMatchObject({
      locale: 'es',
      theme: 'system',
      experimental: false,
      grid: true,
      exporter: '',
    });
    expect(p.exportOptions).toEqual({});
  });

  it('sobrevive a un almacenamiento que lanza errores', () => {
    const broken: KeyValueStorage = {
      getItem: () => {
        throw new Error('bloqueado');
      },
      setItem: () => {
        throw new Error('bloqueado');
      },
    };
    const p = loadPreferences(broken, ['en']);
    expect(p.locale).toBe('en');
    expect(savePreferences(broken, p)).toBe(false);
    expect(savePreferences(undefined, p)).toBe(false);
    expect(browserStorage()).toBeUndefined();
  });
});
