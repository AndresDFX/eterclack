import { Link } from 'react-router-dom';

const ITEMS = [
  { key: 'fotografos', to: '/admin', label: 'Fotógrafos' },
  { key: 'usuarios', to: '/admin/usuarios', label: 'Usuarios' },
] as const;

/** Navegación entre las secciones del panel de administración. */
export function AdminNav({ active }: { active: (typeof ITEMS)[number]['key'] }) {
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
