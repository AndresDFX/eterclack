import { useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { AuthShell, Field, FormError, FormSuccess } from '@/components/AuthShell';
import { api, ApiError } from '@/lib/api';

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);

    try {
      await api.post('/api/auth/forgot-password', { email });
      setSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos procesar la solicitud.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthShell
      title="Recupera tu contraseña"
      subtitle="Te enviamos un enlace para crear una nueva."
      footer={
        <Link to="/ingresar" className="text-lime hover:underline">
          Volver a ingresar
        </Link>
      }
    >
      <form onSubmit={handleSubmit} noValidate>
        <FormError message={error} />
        <FormSuccess
          message={
            sent
              ? 'Si ese correo tiene una cuenta, ya salió el enlace. Revisa tu bandeja.'
              : null
          }
        />

        {!sent && (
          <>
            <Field label="Correo">
              <input
                type="email"
                className="field"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                autoComplete="email"
                required
              />
            </Field>

            <button type="submit" className="btn btn-primary w-full" disabled={busy}>
              {busy ? 'Enviando…' : 'Enviar enlace'}
            </button>
          </>
        )}
      </form>
    </AuthShell>
  );
}
