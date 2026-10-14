import { useEffect, useId, useRef, type ReactNode } from 'react';
import { useI18n } from '../i18n/index.tsx';
import { PixelIcon } from './PixelIcon.tsx';

/**
 * Diálogo modal con `<dialog>` nativo: el resto de la página queda inerte,
 * Escape lo cierra, el foco entra en el diálogo y vuelve al control que lo
 * abrió al cerrarse.
 */
export function Dialog(props: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  actions?: ReactNode;
  /** Selector del elemento que recibe el foco al abrir. */
  initialFocus?: string;
  testId?: string;
}) {
  const { open, title, onClose, children, actions, initialFocus, testId } = props;
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const returnFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);
  const { tk } = useI18n();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      returnFocus.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      const target = initialFocus ? dialog.querySelector<HTMLElement>(initialFocus) : null;
      (
        target ??
        dialog.querySelector<HTMLElement>(
          '.dialog-body button, .dialog-body input, .dialog-body select, .dialog-actions button',
        )
      )?.focus();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open, initialFocus]);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const onCancel = (event: Event) => {
      event.preventDefault();
      onCloseRef.current();
    };
    const onClosed = () => {
      const el = returnFocus.current;
      returnFocus.current = null;
      if (el && el.isConnected) el.focus();
    };
    dialog.addEventListener('cancel', onCancel);
    dialog.addEventListener('close', onClosed);
    return () => {
      dialog.removeEventListener('cancel', onCancel);
      dialog.removeEventListener('close', onClosed);
      // Diálogo desmontado estando abierto (ventanas que solo existen mientras
      // están abiertas): el evento `close` no llega, así que el foco se
      // devuelve aquí. Si el nodo sigue conectado no es un desmontaje real.
      if (!dialog.isConnected) onClosed();
    };
  }, []);

  return (
    <dialog ref={ref} className="dialog" aria-labelledby={titleId} data-testid={testId}>
      <div className="titlebar">
        <h2 id={titleId} className="dialog-title">
          {title}
        </h2>
        <button
          type="button"
          className="btn icon-only compact"
          onClick={onClose}
          aria-label={tk('dialog.close')}
        >
          <PixelIcon name="close" />
        </button>
      </div>
      {open ? (
        <>
          <div className="dialog-body">{children}</div>
          {actions ? <div className="dialog-actions">{actions}</div> : null}
        </>
      ) : null}
    </dialog>
  );
}
