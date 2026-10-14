import { ledDiagnosticFrames } from '../../core/led-diagnostics.ts';
import { LIMITS } from '../../core/limits.ts';
import { useEditor, useServices } from '../app-context.tsx';
import { useI18n } from '../i18n/index.tsx';
import { Dialog } from './Dialog.tsx';

/**
 * Patrones de diagnóstico de la matriz de LEDs: explica qué comprobar en el
 * módulo real y los añade como fotogramas (deshacible) para exportarlos con
 * la orientación y el cableado del proyecto.
 */
export function DiagnosticsDialog(props: { open: boolean; onClose: () => void }) {
  const { tk } = useI18n();
  const { store } = useServices();
  const frames = useEditor((s) => s.project.frames.length);
  if (!props.open) return null;
  const count = ledDiagnosticFrames().length;
  const fits = frames + count <= LIMITS.maxFrames;
  return (
    <Dialog
      open
      title={tk('diagnostics.title')}
      onClose={props.onClose}
      testId="diagnostics-dialog"
      actions={
        <>
          <button
            type="button"
            className="btn primary"
            disabled={!fits}
            onClick={() => {
              if (store.appendDiagnostics()) props.onClose();
            }}
            data-testid="diagnostics-add"
          >
            {tk('diagnostics.add', { count })}
          </button>
          <button type="button" className="btn" onClick={props.onClose}>
            {tk('dialog.cancel')}
          </button>
        </>
      }
    >
      <p>{tk('diagnostics.intro')}</p>
      <ol className="diagnostic-steps">
        <li>{tk('diagnostics.orientation')}</li>
        <li>{tk('diagnostics.corners')}</li>
        <li>{tk('diagnostics.rows')}</li>
        <li>{tk('diagnostics.cols')}</li>
        <li>{tk('diagnostics.all')}</li>
      </ol>
      <p className="hint">{tk('diagnostics.fix')}</p>
      {!fits ? (
        <p className="error-text" role="alert">
          {tk('project.tooManyFrames', { max: LIMITS.maxFrames })}
        </p>
      ) : null}
    </Dialog>
  );
}
