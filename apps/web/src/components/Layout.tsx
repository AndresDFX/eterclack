import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useState } from 'react';
import { Logo } from './Logo';
import { useAuth } from '@/lib/auth';

export function Layout() {
  const { user, photographer, logout } = useAuth();
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);

  const panelPath =
    user?.role === 'ADMIN' ? '/admin' : user?.role === 'PHOTOGRAPHER' ? '/panel' : '/mis-citas';

  async function handleLogout() {
    await logout();
    setMenuOpen(false);
    navigate('/');
  }

  return (
    <div className="flex min-h-screen flex-col bg-ink">
      {/* ── Aviso de correo sin verificar ───────────────────── */}
      {user && !user.emailVerified && (
        <div className="border-b border-lime/30 bg-lime/10 px-4 py-2.5 text-center text-sm">
          <span className="text-bone">Confirma tu correo para poder reservar. </span>
          <Link to="/verificar" className="font-semibold text-lime underline underline-offset-2">
            Reenviar enlace
          </Link>
        </div>
      )}

      {/* ── Barra superior ──────────────────────────────────── */}
      <header className="sticky top-0 z-50 border-b border-ink-line bg-ink/95 backdrop-blur">
        <nav className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 md:px-8">
          <Link to="/" aria-label="EterClack, inicio">
            <Logo size="sm" />
          </Link>

          <div className="hidden items-center gap-8 lg:flex">
            <NavItem to="/fotografos">Fotógrafos</NavItem>
            <NavItem to="/como-funciona">Cómo funciona</NavItem>
            {user?.role === 'CLIENT' && <NavItem to="/mis-citas">Mis citas</NavItem>}
            {user?.role === 'PHOTOGRAPHER' && <NavItem to="/panel/citas">Mis citas</NavItem>}
            {user?.role === 'PHOTOGRAPHER' && <NavItem to="/panel/agenda">Calendario</NavItem>}
            {user?.role === 'ADMIN' && <NavItem to="/admin">Administración</NavItem>}
          </div>

          <div className="hidden items-center gap-3 lg:flex">
            {user ? (
              <>
                <Link to={panelPath} className="btn btn-ghost">
                  {user.fullName.split(' ')[0]}
                  {photographer?.status === 'PENDING' && (
                    <span className="ml-2 h-1.5 w-1.5 rounded-full bg-warn" title="Perfil en revisión" />
                  )}
                </Link>
                <button onClick={handleLogout} className="btn btn-secondary">
                  Salir
                </button>
              </>
            ) : (
              <>
                <Link to="/ingresar" className="btn btn-ghost">
                  Ingresar
                </Link>
                <Link to="/registro" className="btn btn-primary">
                  Crear cuenta
                </Link>
              </>
            )}
          </div>

          <button
            className="btn btn-ghost lg:hidden"
            onClick={() => setMenuOpen((v) => !v)}
            aria-expanded={menuOpen}
            aria-label="Abrir menú"
          >
            <MenuIcon open={menuOpen} />
          </button>
        </nav>

        {menuOpen && (
          <div className="border-t border-ink-line px-4 py-4 lg:hidden">
            <div className="flex flex-col gap-1">
              <MobileItem to="/fotografos" onClick={() => setMenuOpen(false)}>
                Fotógrafos
              </MobileItem>
              <MobileItem to="/como-funciona" onClick={() => setMenuOpen(false)}>
                Cómo funciona
              </MobileItem>
              {user ? (
                <>
                  {user.role === 'CLIENT' && (
                    <MobileItem to="/mis-citas" onClick={() => setMenuOpen(false)}>
                      Mis citas
                    </MobileItem>
                  )}
                  {user.role === 'PHOTOGRAPHER' && (
                    <>
                      <MobileItem to="/panel/citas" onClick={() => setMenuOpen(false)}>
                        Mis citas
                      </MobileItem>
                      <MobileItem to="/panel/agenda" onClick={() => setMenuOpen(false)}>
                        Calendario
                      </MobileItem>
                      <MobileItem to="/panel" onClick={() => setMenuOpen(false)}>
                        Mi perfil
                      </MobileItem>
                    </>
                  )}
                  {user.role === 'ADMIN' && (
                    <MobileItem to="/admin" onClick={() => setMenuOpen(false)}>
                      Administración
                    </MobileItem>
                  )}
                  <button
                    onClick={handleLogout}
                    className="link-nav px-3 py-3 text-left text-bone-dim hover:text-bone"
                  >
                    Salir
                  </button>
                </>
              ) : (
                <>
                  <MobileItem to="/ingresar" onClick={() => setMenuOpen(false)}>
                    Ingresar
                  </MobileItem>
                  <Link
                    to="/registro"
                    onClick={() => setMenuOpen(false)}
                    className="btn btn-primary mt-2"
                  >
                    Crear cuenta
                  </Link>
                </>
              )}
            </div>
          </div>
        )}
      </header>

      <main className="flex-1">
        <Outlet />
      </main>

      {/* ── Pie ─────────────────────────────────────────────── */}
      <footer className="border-t border-ink-line">
        <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
          <div className="flex flex-col gap-10 md:flex-row md:justify-between">
            <div>
              <Logo size="md" showTagline />
              <p className="mt-5 max-w-xs text-sm leading-relaxed text-bone-mute">
                Encuentra, reserva y recibe tu sesión fotográfica sin salir de la plataforma.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-8 sm:gap-10 md:grid-cols-3">
              <FooterCol
                title="Plataforma"
                links={[
                  { to: '/fotografos', label: 'Buscar fotógrafos' },
                  { to: '/como-funciona', label: 'Cómo funciona' },
                  { to: '/registro?rol=fotografo', label: 'Ser fotógrafo' },
                ]}
              />
              <FooterCol
                title="Cuenta"
                links={[
                  { to: '/ingresar', label: 'Ingresar' },
                  { to: '/registro', label: 'Crear cuenta' },
                  { to: '/recuperar', label: 'Recuperar contraseña' },
                ]}
              />
              <FooterCol
                title="Legal"
                links={[
                  { to: '/terminos', label: 'Términos' },
                  { to: '/privacidad', label: 'Tratamiento de datos' },
                ]}
              />
            </div>
          </div>

          <div className="mt-12 flex flex-col gap-3 border-t border-ink-line pt-6 sm:flex-row sm:items-center sm:justify-between">
            <p className="overline">ETERnidad a un solo CLACK</p>
            <p className="text-xs text-bone-mute">
              © {new Date().getFullYear()} EterClack · Colombia
            </p>
          </div>
        </div>
      </footer>
    </div>
  );
}

function NavItem({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        `link-nav text-sm font-medium transition-colors ${
          isActive ? 'text-lime' : 'text-bone-dim hover:text-bone'
        }`
      }
    >
      {children}
    </NavLink>
  );
}

function MobileItem({
  to,
  children,
  onClick,
}: {
  to: string;
  children: React.ReactNode;
  onClick: () => void;
}) {
  return (
    <NavLink
      to={to}
      onClick={onClick}
      className={({ isActive }) =>
        `link-nav px-3 py-3 text-base ${isActive ? 'text-lime' : 'text-bone-dim hover:text-bone'}`
      }
    >
      {children}
    </NavLink>
  );
}

function FooterCol({
  title,
  links,
}: {
  title: string;
  links: { to: string; label: string }[];
}) {
  return (
    <div>
      <h3 className="overline mb-4">{title}</h3>
      <ul className="space-y-2.5">
        {links.map((l) => (
          <li key={l.to}>
            <Link to={l.to} className="link-nav text-sm text-bone-dim transition-colors hover:text-lime">
              {l.label}
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function MenuIcon({ open }: { open: boolean }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      {open ? (
        <path d="M18 6 6 18M6 6l12 12" />
      ) : (
        <>
          <path d="M3 6h18" />
          <path d="M3 12h18" />
          <path d="M3 18h18" />
        </>
      )}
    </svg>
  );
}
