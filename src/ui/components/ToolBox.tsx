import { useEffect, useRef } from 'react';
import { resolveColors } from '../../core/appearance.ts';
import { useEditor, useServices } from '../app-context.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { useProfile } from '../hooks.ts';
import { CHARACTER_ONLY_TOOLS, TOOLS, type ToolId } from '../state/editor-store.ts';
import { PixelIcon } from './PixelIcon.tsx';

export const TOOL_KEYS: Readonly<Record<ToolId, string>> = {
  select: 'S',
  pencil: 'P',
  eraser: 'E',
  fill: 'F',
  line: 'L',
  rect: 'R',
  ellipse: 'C',
  text: 'T',
  pattern: 'G',
};

export function ToolBox() {
  const { tk } = useI18n();
  const { store } = useServices();
  const tool = useEditor((s) => s.tool);
  const filled = useEditor((s) => s.filled);
  const appearance = useEditor((s) => s.project.appearance);
  const swatch = useRef<HTMLDivElement>(null);
  const profile = useProfile();
  const tools = TOOLS.filter(
    (id) => profile.kind === 'character' || !CHARACTER_ONLY_TOOLS.includes(id),
  );

  useEffect(() => {
    const colors = resolveColors(appearance);
    swatch.current?.style.setProperty('--swatch-on', colors.on);
    swatch.current?.style.setProperty('--swatch-off', colors.off);
  }, [appearance]);

  return (
    <nav className="toolbox raised" aria-label={tk('tools.label')}>
      <div className="panel-title" aria-hidden="true">
        {tk('tools.label')}
      </div>
      <div className="tool-grid" role="radiogroup" aria-label={tk('tools.label')}>
        {tools.map((id) => {
          const name = tk(`tool.${id}` as MessageKey);
          return (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={tool === id}
              className="btn"
              data-testid={`tool-${id}`}
              aria-label={tk('tool.withKey', { tool: name, key: TOOL_KEYS[id] })}
              title={tk('tool.withKey', { tool: name, key: TOOL_KEYS[id] })}
              tabIndex={tool === id ? 0 : -1}
              onClick={() => store.setTool(id)}
              onKeyDown={(e) => {
                const idx = tools.indexOf(id);
                const delta =
                  e.key === 'ArrowRight' || e.key === 'ArrowDown'
                    ? 1
                    : e.key === 'ArrowLeft' || e.key === 'ArrowUp'
                      ? -1
                      : 0;
                if (!delta) return;
                e.preventDefault();
                const next = tools[(idx + delta + tools.length) % tools.length]!;
                store.setTool(next);
                (
                  e.currentTarget.parentElement?.querySelector(
                    `[data-testid="tool-${next}"]`,
                  ) as HTMLElement | null
                )?.focus();
              }}
            >
              <PixelIcon name={id} />
            </button>
          );
        })}
      </div>
      {tool === 'rect' || tool === 'ellipse' ? (
        <label className="check">
          <input
            type="checkbox"
            checked={filled}
            onChange={(e) => store.setFilled(e.target.checked)}
          />
          {tk('tools.filled')}
        </label>
      ) : null}
      <div className="swatch" ref={swatch} title={tk('tools.swatch')} aria-hidden="true">
        <span className="on" />
        <span className="off" />
      </div>
    </nav>
  );
}
