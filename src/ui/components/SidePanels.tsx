import { useId, useRef, type ReactNode } from 'react';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { DrawPanel } from './DrawPanel.tsx';
import { ExportPanel } from './ExportPanel.tsx';
import { ImagePanel } from './ImagePanel.tsx';
import { ProjectPanel } from './ProjectPanel.tsx';

export type PanelId = 'draw' | 'image' | 'export' | 'project';
const PANELS: readonly PanelId[] = ['draw', 'image', 'export', 'project'];

export function SidePanels({
  active,
  onChange,
}: {
  active: PanelId;
  onChange: (id: PanelId) => void;
}) {
  const { tk } = useI18n();
  const base = useId();
  const tabs = useRef<Record<string, HTMLButtonElement | null>>({});
  const content: Record<PanelId, ReactNode> = {
    draw: <DrawPanel />,
    image: <ImagePanel onActivate={() => onChange('image')} />,
    export: <ExportPanel />,
    project: <ProjectPanel />,
  };
  const focusTab = (id: PanelId) => {
    onChange(id);
    tabs.current[id]?.focus();
  };
  return (
    <aside className="side raised" aria-label={tk('panels.label')}>
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
          {/* El panel de imagen se mantiene montado para conservar la imagen abierta. */}
          {active === id || id === 'image' ? content[id] : null}
        </div>
      ))}
    </aside>
  );
}
