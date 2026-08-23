import { Link } from 'react-router-dom';

const ITEMS = [
  { key: 'perfil', to: '/panel', label: 'Mi perfil' },
  { key: 'citas', to: '/panel/citas', label: 'Mis citas' },
  { key: 'agenda', to: '/panel/agenda', label: 'Calendario' },
] as const;

/** Navegación entre las secciones del panel del fotógrafo. */
export function PanelNav({ active }: { active: (typeof ITEMS)[number]['key'] }) {
  return (
    <nav className="mb-8 flex flex-wrap gap-2">
      {ITEMS.map((i) => (
        <Link
          key={i.key}
          to={i.to}
          className={`inline-flex min-h-11 items-center border px-4 py-2 text-sm font-medium transition-colors ${
            active === i.key
              ? 'border-lime text-lime'
              : 'border-ink-line text-bone-dim hover:border-bone-mute hover:text-bone'
          }`}
        >
          {i.label}
        </Link>
      ))}
    </nav>
  );
}
