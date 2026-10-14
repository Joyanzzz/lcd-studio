import { useSyncExternalStore } from 'react';
import { useServices } from '../app-context.tsx';
import { useI18n } from '../i18n/index.tsx';
import { PixelIcon } from './PixelIcon.tsx';

/**
 * Notificaciones accesibles. Hay dos regiones vivas permanentes (cortés para
 * información y asertiva para errores), de modo que los lectores de pantalla
 * anuncian cada mensaje nuevo.
 */
export function Toasts() {
  const { toasts } = useServices();
  const list = useSyncExternalStore(toasts.subscribe, toasts.getState);
  const { t, tk } = useI18n();
  const render = (kinds: readonly string[]) =>
    list
      .filter((toast) => kinds.includes(toast.kind))
      .map((toast) => (
        <div key={toast.id} className="toast" data-kind={toast.kind} data-testid="toast">
          <PixelIcon
            name={
              toast.kind === 'error'
                ? 'error'
                : toast.kind === 'warning'
                  ? 'warning'
                  : toast.kind === 'success'
                    ? 'check'
                    : 'info'
            }
          />
          <p>{t(toast.key, toast.params)}</p>
          <button
            type="button"
            className="btn icon-only compact"
            onClick={() => toasts.dismiss(toast.id)}
            aria-label={tk('toast.dismiss')}
          >
            <PixelIcon name="close" />
          </button>
        </div>
      ));
  return (
    <section className="toasts" aria-label={tk('toast.region')}>
      <div role="status" aria-live="polite">
        {render(['info', 'success', 'warning'])}
      </div>
      <div role="alert" aria-live="assertive">
        {render(['error'])}
      </div>
    </section>
  );
}
