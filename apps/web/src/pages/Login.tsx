import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AuthShell, Field, FormError } from '@/components/AuthShell';
import { useAuth } from '@/lib/auth';
import { ApiError } from '@/lib/api';

export function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      const user = await login(email, password);
      navigate(
        user.role === 'ADMIN' ? '/admin' : user.role === 'PHOTOGRAPHER' ? '/panel' : '/fotografos',
        { replace: true },
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos iniciar sesión.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Ingresa a tu cuenta"
      subtitle="Accede a tus solicitudes, galerías y entregas."
      footer={
        <>
          ¿No tienes cuenta?{' '}
          <Link to="/registro" className="text-lime hover:underline">
            Crear una
          </Link>
        </>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <FormError message={error} />

        <Field label="Correo">
          <input
            type="email"
            className="field"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoComplete="email"
            required
            placeholder="tucorreo@ejemplo.com"
          />
        </Field>

        <Field label="Contraseña">
          <input
            type="password"
            className="field"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </Field>

        <div className="mb-6 text-right">
          <Link to="/recuperar" className="link-nav text-xs text-bone-dim hover:text-lime">
            ¿Olvidaste tu contraseña?
          </Link>
        </div>

        <button type="submit" className="btn btn-primary w-full" disabled={busy}>
          {busy ? 'Ingresando…' : 'Ingresar'}
        </button>
      </form>
    </AuthShell>
  );
}
