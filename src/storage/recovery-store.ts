/**
 * Almacén de recuperación automática.
 *
 * Guarda el último estado estable y la copia anterior en dos ranuras que se
 * alternan. Cada guardado escribe la ranura que no es la actual y mueve el
 * puntero en una sola transacción: un cierre inesperado nunca deja ambas
 * copias a medias y no hace falta leer ni copiar el registro anterior.
 */

export interface RecoveryRecord {
  /** Proyecto serializado (`.lcdstudio.json`). */
  readonly bytes: Uint8Array;
  readonly savedAt: number;
  /** Hay cambios que no se guardaron en un archivo (solo informativo). */
  readonly unsavedToFile: boolean;
}

export interface RecoverySnapshot {
  readonly current?: RecoveryRecord;
  readonly previous?: RecoveryRecord;
}

export interface RecoveryStore {
  load(): Promise<RecoverySnapshot>;
  save(record: RecoveryRecord): Promise<void>;
  clear(): Promise<void>;
}

const DB_NAME = 'lcd-studio';
const DB_VERSION = 1;
const STORE = 'recovery';
const POINTER_KEY = 'pointer';
const SLOTS = ['slot-a', 'slot-b'] as const;
type Slot = (typeof SLOTS)[number];

function otherSlot(slot: Slot): Slot {
  return slot === SLOTS[0] ? SLOTS[1] : SLOTS[0];
}

/** Puntero a la ranura actual; la otra ranura guarda la copia anterior. */
function readPointer(value: unknown): { current: Slot; hasPrevious: boolean } | null {
  if (typeof value !== 'object' || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v['current'] !== SLOTS[0] && v['current'] !== SLOTS[1]) return null;
  return { current: v['current'], hasPrevious: v['hasPrevious'] === true };
}

function isRecord(value: unknown): value is RecoveryRecord {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    v['bytes'] instanceof Uint8Array &&
    typeof v['savedAt'] === 'number' &&
    typeof v['unsavedToFile'] === 'boolean'
  );
}

function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
  });
}

function openDb(factory: IDBFactory, onClosed: () => void): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = factory.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => {
      // Libera la base de datos si otra pestaña o versión necesita actualizarla o borrarla.
      req.result.onversionchange = () => {
        req.result.close();
        onClosed();
      };
      resolve(req.result);
    };
    req.onerror = () => reject(req.error ?? new Error('IndexedDB'));
    req.onblocked = () => reject(new Error('IndexedDB bloqueada'));
  });
}

export function createIndexedDbRecoveryStore(factory: IDBFactory = indexedDB): RecoveryStore {
  let dbPromise: Promise<IDBDatabase> | null = null;
  // Tras cerrarse por "versionchange", la siguiente operación vuelve a abrirla.
  const db = () =>
    (dbPromise ??= openDb(factory, () => {
      dbPromise = null;
    }));

  return {
    async load() {
      const database = await db();
      const tx = database.transaction(STORE, 'readonly');
      const store = tx.objectStore(STORE);
      const pointer = readPointer(await request(store.get(POINTER_KEY)));
      if (!pointer) return {};
      const [current, previous] = await Promise.all([
        request(store.get(pointer.current)),
        request(store.get(otherSlot(pointer.current))),
      ]);
      return {
        ...(isRecord(current) ? { current } : {}),
        ...(pointer.hasPrevious && isRecord(previous) ? { previous } : {}),
      };
    },

    async save(record) {
      const database = await db();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(STORE, 'readwrite', { durability: 'strict' });
        const store = tx.objectStore(STORE);
        // Solo se lee el puntero (pequeño): el registro nuevo va a la otra ranura
        // y la que era actual pasa a ser la copia anterior, sin copiarla.
        const get = store.get(POINTER_KEY);
        get.onsuccess = () => {
          const pointer = readPointer(get.result);
          const target = pointer ? otherSlot(pointer.current) : SLOTS[0];
          store.put(record, target);
          store.put({ current: target, hasPrevious: pointer !== null }, POINTER_KEY);
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB'));
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB abortada'));
      });
    },

    async clear() {
      const database = await db();
      await new Promise<void>((resolve, reject) => {
        const tx = database.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).clear();
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB'));
      });
    },
  };
}

/** Implementación en memoria (pruebas y entornos sin IndexedDB). */
export function createMemoryRecoveryStore(): RecoveryStore & { failNext: boolean } {
  let current: RecoveryRecord | undefined;
  let previous: RecoveryRecord | undefined;
  const store = {
    failNext: false,
    async load() {
      return { ...(current ? { current } : {}), ...(previous ? { previous } : {}) };
    },
    async save(record: RecoveryRecord) {
      if (store.failNext) {
        store.failNext = false;
        throw new Error('fallo simulado');
      }
      if (current) previous = current;
      current = record;
    },
    async clear() {
      current = undefined;
      previous = undefined;
    },
  };
  return store;
}
