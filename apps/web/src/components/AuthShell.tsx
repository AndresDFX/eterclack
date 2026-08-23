import { Link } from 'react-router-dom';
import { Logo } from './Logo';

/** Contenedor común de las pantallas de cuenta: registro, ingreso, recuperación. */
export function AuthShell({
  title,
  subtitle,
  children,
  footer,
}: {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex min-h-[calc(100vh-140px)] max-w-md flex-col justify-center px-4 py-16">
      <Link to="/" className="mb-10 self-start" aria-label="EterClack, inicio">
        <Logo size="md" showTagline />
      </Link>

      <div className="clack-frame bg-ink-soft p-8">
        <h1 className="text-2xl text-bone">{title}</h1>
        {subtitle && <p className="mt-2 text-sm leading-relaxed text-bone-dim">{subtitle}</p>}
        <div className="mt-8">{children}</div>
      </div>

      {footer && (
        <div className="mt-6 flex justify-center text-center text-sm text-bone-dim">
          <span className="link-nav gap-1">{footer}</span>
        </div>
      )}
    </div>
  );
}

export function FormError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="alert"
      className="mb-5 border-l-2 border-danger bg-danger/10 px-4 py-3 text-sm text-bone"
    >
      {message}
    </div>
  );
}

export function FormSuccess({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div
      role="status"
      className="mb-5 border-l-2 border-success bg-success/10 px-4 py-3 text-sm text-bone"
    >
      {message}
    </div>
  );
}

export function Field({
  label,
  error,
  hint,
  children,
}: {
  label: string;
  error?: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-5">
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      {!error && hint && <p className="mt-1.5 text-xs text-bone-mute">{hint}</p>}
    </div>
  );
}
