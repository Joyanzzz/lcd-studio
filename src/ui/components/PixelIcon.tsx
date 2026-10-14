import { iconPaths, type IconName } from './icons.ts';

/** Icono decorativo: siempre oculto a los lectores de pantalla. */
export function PixelIcon({ name, className }: { name: IconName; className?: string }) {
  return (
    <svg
      className={className ? `px-icon ${className}` : 'px-icon'}
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
