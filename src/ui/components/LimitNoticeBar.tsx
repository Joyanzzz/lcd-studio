import { useSyncExternalStore } from 'react';
import { useServices } from '../app-context.tsx';
import { useI18n } from '../i18n/index.tsx';
import { PixelIcon } from './PixelIcon.tsx';

/**
 * Aviso único del límite de caracteres propios. La región viva existe
 * siempre; su texto solo se inserta al aparecer, de modo que el lector de
 * pantalla lo anuncia una vez por aparición y no en cada movimiento.
 * No recibe el foco.
 */
export function LimitNoticeBar() {
  const { limitNotice } = useServices();
  const state = useSyncExternalStore(limitNotice.subscribe, limitNotice.getState);
  const { tk } = useI18n();
  return (
    <div className="limit-notice-region" aria-live="assertive" aria-atomic="true">
      {state.visible ? (
        <div
          className="limit-notice"
          data-testid="limit-notice"
          data-active={state.active ? 'true' : 'false'}
          key={state.shownCount}
        >
          <PixelIcon name="error" />
          <p>
            <strong>{tk('limit.title')}</strong> {tk('limit.body')}
          </p>
          <button
            type="button"
            className="btn icon-only compact"
            onClick={() => limitNotice.dismiss()}
            aria-label={tk('limit.dismiss')}
            data-testid="limit-notice-close"
          >
            <PixelIcon name="close" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
