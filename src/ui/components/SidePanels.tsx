import { useId, useRef, type ReactNode } from 'react';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { DrawPanel } from './DrawPanel.tsx';
import { ImagePanel } from './ImagePanel.tsx';
import { PixelIcon } from './PixelIcon.tsx';

export type PanelId = 'draw' | 'image';
const PANELS: readonly PanelId[] = ['draw', 'image'];

/**
 * Panel lateral con las pestañas Dibujo e Imagen. Se puede retraer (en
 * pantallas pequeñas se muestra como un cajón superpuesto); su contenido
 * permanece montado para no perder la imagen abierta ni los ajustes.
 */
export function SidePanels({
  active,
  onChange,
  open,
  onClose,
}: {
  active: PanelId;
  onChange: (id: PanelId) => void;
  open: boolean;
  onClose: () => void;
}) {
  const { tk } = useI18n();
  const base = useId();
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const content: Record<PanelId, ReactNode> = {
    draw: <DrawPanel />,
    image: <ImagePanel onActivate={() => onChange('image')} />,
  };
  const focusTab = (id: PanelId) => {
    onChange(id);
    tabs.current[id]?.focus();
  };
  return (
    <aside
      className="side raised"
      id="side-panel"
      aria-label={tk('panels.label')}
      data-open={open ? 'true' : 'false'}
      data-testid="side-panel"
      inert={!open}
    >
      <div className="side-head">
        <div className="tabs" role="tablist" aria-label={tk('panels.label')}>
          {PANELS.map((id, i) => (
            <button
              key={id}
              ref={(el) => {
                tabs.current[id] = el;
              }}
              type="button"
              role="tab"
              id={`${base}-tab-${id}`}
              aria-selected={active === id}
              aria-controls={`${base}-panel-${id}`}
              tabIndex={active === id ? 0 : -1}
              data-testid={`tab-${id}`}
              onClick={() => onChange(id)}
              onKeyDown={(e) => {
                const n = PANELS.length;
                if (e.key === 'ArrowRight') focusTab(PANELS[(i + 1) % n]!);
                else if (e.key === 'ArrowLeft') focusTab(PANELS[(i - 1 + n) % n]!);
                else if (e.key === 'Home') focusTab(PANELS[0]!);
                else if (e.key === 'End') focusTab(PANELS[n - 1]!);
                else return;
                e.preventDefault();
              }}
            >
              {tk(`panel.${id}` as MessageKey)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn icon-only compact side-close"
          onClick={onClose}
          aria-label={tk('panels.hide')}
          aria-controls="side-panel"
          title={tk('panels.hide')}
          data-testid="side-close"
        >
          <PixelIcon name="right" />
        </button>
      </div>
      {PANELS.map((id) => (
        <div
          key={id}
          role="tabpanel"
          id={`${base}-panel-${id}`}
          aria-labelledby={`${base}-tab-${id}`}
          className="tab-panel"
          hidden={active !== id}
          tabIndex={0}
        >
          {/* Ambos paneles se mantienen montados para conservar su estado. */}
          {content[id]}
        </div>
      ))}
    </aside>
  );
}
