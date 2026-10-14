/**
 * Registro del service worker (solo en la versión web compilada).
 *
 * - Nunca recarga por sí solo: cuando hay una versión nueva instalada y en
 *   espera, avisa a la interfaz, que pide confirmación y espera a que el
 *   autoguardado termine antes de activarla.
 * - Comprueba actualizaciones al volver a la pestaña.
 */

type Listener = () => void;

let waitingWorker: ServiceWorker | null = null;
const updateListeners = new Set<Listener>();

function notifyUpdate(worker: ServiceWorker): void {
  waitingWorker = worker;
  for (const l of updateListeners) l();
}

export function onUpdateAvailable(listener: Listener): () => void {
  updateListeners.add(listener);
  if (waitingWorker) listener();
  return () => updateListeners.delete(listener);
}

/** Activa la versión en espera y recarga cuando toma el control. */
export function applyUpdate(): void {
  const worker = waitingWorker;
  if (!worker || !('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => window.location.reload(), {
    once: true,
  });
  worker.postMessage({ type: 'SKIP_WAITING' });
}

export function registerServiceWorker(onOfflineReady: () => void): void {
  if (!('serviceWorker' in navigator) || !import.meta.env.PROD) return;
  const hadController = navigator.serviceWorker.controller !== null;
  void navigator.serviceWorker
    .register(new URL('sw.js', document.baseURI).pathname, { scope: './', updateViaCache: 'none' })
    .then((registration) => {
      if (registration.waiting && navigator.serviceWorker.controller)
        notifyUpdate(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const installing = registration.installing;
        if (!installing) return;
        installing.addEventListener('statechange', () => {
          if (installing.state !== 'installed') return;
          if (navigator.serviceWorker.controller) notifyUpdate(installing);
          else if (!hadController) onOfflineReady();
        });
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible')
          void registration.update().catch(() => undefined);
      });
    })
    .catch(() => undefined);
}
