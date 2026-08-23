import { useState, type FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { AuthShell, Field, FormError, FormSuccess } from '@/components/AuthShell';
import { api, ApiError } from '@/lib/api';

export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const navigate = useNavigate();

  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (password !== confirm) {
      setError('Las contraseñas no coinciden.');
      return;
    }

    setBusy(true);
    try {
      await api.post('/api/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => navigate('/ingresar', { replace: true }), 2500);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos cambiar la contraseña.');
    } finally {
      setBusy(false);
    }
  }

  if (!token) {
    return (
      <AuthShell title="Enlace inválido" subtitle="Falta el token de recuperación.">
        <Link to="/recuperar" className="btn btn-primary w-full">
          Pedir un enlace nuevo
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title="Crea una contraseña nueva" subtitle="Cerraremos todas tus sesiones abiertas.">
      <form onSubmit={handleSubmit} noValidate>
        <FormError message={error} />
        <FormSuccess message={done ? 'Listo. Te llevamos al ingreso…' : null} />

        {!done && (
          <>
            <Field label="Nueva contraseña" hint="Mínimo 8 caracteres.">
              <input
                type="password"
                className="field"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="new-password"
                required
                minLength={8}
              />
            </Field>

            <Field label="Repite la contraseña">
              <input
                type="password"
                className="field"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            </Field>

            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? 'Guardando…' : 'Cambiar contraseña'}
            </button>
          </>
        )}
      </form>
    </AuthShell>
  );
}
