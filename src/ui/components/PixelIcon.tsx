import { iconPaths, type IconName } from './icons.ts';

/** Iconos de estado: conservan su color también en el tema oscuro. */
const STATUS_ICONS = new Set<IconName>(['error', 'warning', 'info', 'check']);

/**
 * Icono decorativo: siempre oculto a los lectores de pantalla. En el tema
 * oscuro los iconos de herramientas y acciones se dibujan solo con su
 * contorno en claro (ver `theme.css`).
 */
export function PixelIcon({ name, className }: { name: IconName; className?: string }) {
  const classes = ['px-icon', STATUS_ICONS.has(name) ? 'px-status' : '', className ?? '']
    .filter(Boolean)
    .join(' ');
  return (
    <svg
      className={classes}
      viewBox="0 0 16 16"
      width="16"
      height="16"
      aria-hidden="true"
      focusable="false"
      shapeRendering="crispEdges"
    >
      {iconPaths(name).map((p) => (
        <path key={p.color} className={`px-${p.color}`} d={p.d} />
      ))}
    </svg>
  );
}
