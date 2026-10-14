import { useEffect, useId, useRef, useState } from 'react';
import { useEditor, useServices } from '../app-context.tsx';
import { useI18n, type MessageKey } from '../i18n/index.tsx';
import { PixelIcon } from './PixelIcon.tsx';
import type { IconName } from './icons.ts';

/**
 * Barra de menús (patrón WAI-ARIA «menubar»): Archivo, Editar, Proyecto,
 * Exportar y Ayuda. Flechas para moverse, Intro/Espacio para activar,
 * Escape para cerrar y volver al título del menú; Tab cierra el menú.
 * Deshacer y rehacer quedan además como botones rápidos a la derecha.
 */

export interface MenuItem {
  readonly id: string;
  readonly labelKey: MessageKey;
  readonly shortcut?: string;
  readonly icon?: IconName;
  readonly disabled?: boolean;
  readonly hidden?: boolean;
  /** Abre una ventana emergente (se indica con «…» en la etiqueta). */
  readonly run: () => void;
  readonly separatorBefore?: boolean;
}

export interface Menu {
  readonly id: string;
  readonly labelKey: MessageKey;
  readonly items: readonly MenuItem[];
}

export function MenuBar({ menus }: { menus: readonly Menu[] }) {
  const { tk, t } = useI18n();
  const { store } = useServices();
  const canUndo = useEditor((s) => s.canUndo);
  const canRedo = useEditor((s) => s.canRedo);
  const undoLabel = useEditor((s) => s.undoLabel);
  const redoLabel = useEditor((s) => s.redoLabel);
  const base = useId();
  const [open, setOpen] = useState<number | null>(null);
  const [focusItem, setFocusItem] = useState(0);
  const tops = useRef<(HTMLButtonElement | null)[]>([]);
  const items = useRef<(HTMLButtonElement | null)[]>([]);
  const bar = useRef<HTMLDivElement>(null);
  const [topFocus, setTopFocus] = useState(0);

  const visible = (m: Menu) => m.items.filter((i) => !i.hidden);

  useEffect(() => {
    if (open === null) return undefined;
    const onDown = (e: PointerEvent) => {
      if (!bar.current?.contains(e.target as Node)) setOpen(null);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  useEffect(() => {
    if (open !== null) items.current[focusItem]?.focus();
  }, [open, focusItem]);

  const openMenu = (index: number, item: 'first' | 'last' = 'first') => {
    const list = visible(menus[index]!);
    setOpen(index);
    setTopFocus(index);
    const enabled = list.map((i, k) => (i.disabled ? -1 : k)).filter((k) => k >= 0);
    setFocusItem(item === 'first' ? (enabled[0] ?? 0) : (enabled.at(-1) ?? 0));
  };

  const close = (refocus: boolean) => {
    const index = open;
    setOpen(null);
    if (refocus && index !== null) tops.current[index]?.focus();
  };

  const moveTop = (from: number, delta: number, keepOpen: boolean) => {
    const next = (from + delta + menus.length) % menus.length;
    setTopFocus(next);
    if (keepOpen) openMenu(next);
    else tops.current[next]?.focus();
  };

  const activate = (item: MenuItem) => {
    if (item.disabled) return;
    setOpen(null);
    // Se devuelve el foco al título del menú antes de abrir una ventana, para
    // que esta lo restaure ahí al cerrarse.
    tops.current[open ?? topFocus]?.focus();
    item.run();
  };

  return (
    <div className="menubar-row">
      <div className="menubar" role="menubar" aria-label={tk('menu.label')} ref={bar}>
        {menus.map((menu, mi) => {
          const list = visible(menu);
          const expanded = open === mi;
          return (
            <div key={menu.id} className="menu">
              <button
                type="button"
                role="menuitem"
                id={`${base}-${menu.id}`}
                ref={(el) => {
                  tops.current[mi] = el;
                }}
                className="menu-title"
                aria-haspopup="menu"
                aria-expanded={expanded}
                aria-controls={`${base}-${menu.id}-list`}
                tabIndex={topFocus === mi ? 0 : -1}
                data-testid={`menu-${menu.id}`}
                onClick={() => (expanded ? close(false) : openMenu(mi))}
                onPointerEnter={() => open !== null && open !== mi && openMenu(mi)}
                onKeyDown={(e) => {
                  if (e.key === 'ArrowRight') moveTop(mi, 1, open !== null);
                  else if (e.key === 'ArrowLeft') moveTop(mi, -1, open !== null);
                  else if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')
                    openMenu(mi);
                  else if (e.key === 'ArrowUp') openMenu(mi, 'last');
                  else if (e.key === 'Home') moveTop(0, 0, false);
                  else if (e.key === 'End') moveTop(menus.length - 1, 0, false);
                  else if (e.key === 'Escape' && expanded) close(true);
                  else return;
                  e.preventDefault();
                  e.stopPropagation();
                }}
              >
                {t(menu.labelKey)}
              </button>
              {expanded ? (
                <div
                  className="menu-list raised"
                  role="menu"
                  id={`${base}-${menu.id}-list`}
                  aria-labelledby={`${base}-${menu.id}`}
                  data-testid={`menu-${menu.id}-list`}
                >
                  {list.map((item, ii) => (
                    <div key={item.id} role="none">
                      {item.separatorBefore ? <div className="menu-sep" role="separator" /> : null}
                      <button
                        type="button"
                        role="menuitem"
                        ref={(el) => {
                          items.current[ii] = el;
                        }}
                        className="menu-item"
                        tabIndex={-1}
                        aria-disabled={item.disabled === true}
                        data-testid={`menuitem-${item.id}`}
                        onClick={() => activate(item)}
                        onKeyDown={(e) => {
                          const n = list.length;
                          const step = (d: number) => {
                            let k = ii;
                            for (let c = 0; c < n; c++) {
                              k = (k + d + n) % n;
                              if (!list[k]!.disabled) break;
                            }
                            setFocusItem(k);
                            items.current[k]?.focus();
                          };
                          if (e.key === 'ArrowDown') step(1);
                          else if (e.key === 'ArrowUp') step(-1);
                          else if (e.key === 'Home') step(n - ii);
                          else if (e.key === 'End') step(-ii - 1 + n);
                          else if (e.key === 'ArrowRight') moveTop(mi, 1, true);
                          else if (e.key === 'ArrowLeft') moveTop(mi, -1, true);
                          else if (e.key === 'Escape') close(true);
                          else if (e.key === 'Tab') {
                            setOpen(null);
                            return;
                          } else if (e.key === 'Enter' || e.key === ' ') activate(item);
                          else return;
                          e.preventDefault();
                          e.stopPropagation();
                        }}
                      >
                        <span className="menu-icon">
                          {item.icon ? <PixelIcon name={item.icon} /> : null}
                        </span>
                        <span className="menu-label">{t(item.labelKey)}</span>
                        {item.shortcut ? (
                          <span className="menu-shortcut" aria-hidden="true">
                            {item.shortcut}
                          </span>
                        ) : null}
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
      <span className="spacer" />
      <div className="quick-actions" role="toolbar" aria-label={tk('toolbar.label')}>
        <button
          type="button"
          className="btn icon-only"
          onClick={() => store.undo()}
          disabled={!canUndo}
          aria-label={tk('toolbar.undo')}
          title={
            undoLabel ? tk('toolbar.undo.tip', { action: t(undoLabel) }) : tk('toolbar.undo.none')
          }
        >
          <PixelIcon name="undo" />
        </button>
        <button
          type="button"
          className="btn icon-only"
          onClick={() => store.redo()}
          disabled={!canRedo}
          aria-label={tk('toolbar.redo')}
          title={
            redoLabel ? tk('toolbar.redo.tip', { action: t(redoLabel) }) : tk('toolbar.redo.none')
          }
        >
          <PixelIcon name="redo" />
        </button>
      </div>
    </div>
  );
}
