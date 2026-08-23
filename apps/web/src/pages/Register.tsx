import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell, Field, FormError } from '@/components/AuthShell';
import { api, ApiError, type User } from '@/lib/api';
import { useAuth } from '@/lib/auth';

export function RegisterPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const [role, setRole] = useState<'CLIENT' | 'PHOTOGRAPHER'>(
    params.get('rol') === 'fotografo' ? 'PHOTOGRAPHER' : 'CLIENT',
  );
  const [form, setForm] = useState({ fullName: '', email: '', phone: '', password: '' });
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ApiError | null>(null);
  const [busy, setBusy] = useState(false);

  function set(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setIssues(null);
    setBusy(true);

    try {
      await api.post<{ user: User }>('/api/auth/register', {
        ...form,
        phone: form.phone || undefined,
        role,
        acceptTerms,
      });
      refresh();
      navigate(role === 'PHOTOGRAPHER' ? '/panel' : '/fotografos', { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message);
        setIssues(err);
      } else {
        setError('No pudimos crear la cuenta.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Crea tu cuenta"
      subtitle="Un solo registro para contratar o para trabajar como fotógrafo."
      footer={
        <>
          ¿Ya tienes cuenta?{' '}
          <Link to="/ingresar" className="text-lime hover:underline">
            Ingresar
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <FormError message={error} />

        {/* Selector de rol */}
        <fieldset className="mb-6">
          <legend className="label">Quiero</legend>
          <div className="grid grid-cols-2 gap-2">
            <RoleOption
              active={role === 'CLIENT'}
              onClick={() => setRole('CLIENT')}
              title="Contratar"
              detail="Busco fotógrafo"
            />
            <RoleOption
              active={role === 'PHOTOGRAPHER'}
              onClick={() => setRole('PHOTOGRAPHER')}
              title="Trabajar"
              detail="Soy fotógrafo"
            />
          </div>
        </fieldset>

        <Field label="Nombre completo" error={issues?.fieldError('fullName')}>
          <input
            type="text"
            className="field"
            value={form.fullName}
            onChange={(e) => set('fullName', e.target.value)}
            autoComplete="name"
            required
          />
        </Field>

        <Field label="Correo" error={issues?.fieldError('email')}>
          <input
            type="email"
            className="field"
            value={form.email}
            onChange={(e) => set('email', e.target.value)}
            autoComplete="email"
            required
          />
        </Field>

        <Field label="Teléfono (opcional)">
          <input
            type="tel"
            className="field"
            value={form.phone}
            onChange={(e) => set('phone', e.target.value)}
            autoComplete="tel"
            placeholder="+57 300 000 0000"
          />
        </Field>

        <Field
          label="Contraseña"
          error={issues?.fieldError('password')}
          hint="Mínimo 8 caracteres."
        >
          <input
            type="password"
            className="field"
            value={form.password}
            onChange={(e) => set('password', e.target.value)}
            autoComplete="new-password"
            required
            minLength={8}
          />
        </Field>

        <label className="check-row mb-6 text-sm text-bone-dim">
          <input
            type="checkbox"
            checked={acceptTerms}
            onChange={(e) => setAcceptTerms(e.target.checked)}
            className="checkbox mt-0.5"
            required
          />
          <span>
            Acepto los{' '}
            <Link to="/terminos" className="text-lime hover:underline">
              términos
            </Link>{' '}
            y la{' '}
            <Link to="/privacidad" className="text-lime hover:underline">
              política de tratamiento de datos
            </Link>
            .
          </span>
        </label>

        <button type="submit" className="btn btn-primary w-full" disabled={busy || !acceptTerms}>
          {busy ? 'Creando cuenta…' : 'Crear cuenta'}
        </button>

        {role === 'PHOTOGRAPHER' && (
          <p className="mt-4 text-xs leading-relaxed text-bone-mute">
            Tu perfil entra en revisión. Solo aparece en las búsquedas después de que
            administración lo apruebe.
          </p>
        )}
      </form>
    </AuthShell>
  );
}

function RoleOption({
  active,
  onClick,
  title,
  detail,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  detail: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`border p-4 text-left transition-colors ${
        active
          ? 'border-lime bg-lime/10'
          : 'border-ink-line hover:border-bone-mute'
      }`}
    >
      <span
        className={`block font-[family-name:var(--font-display)] font-semibold ${
          active ? 'text-lime' : 'text-bone'
        }`}
      >
        {title}
      </span>
      <span className="mt-0.5 block text-xs text-bone-mute">{detail}</span>
    </button>
  );
}
