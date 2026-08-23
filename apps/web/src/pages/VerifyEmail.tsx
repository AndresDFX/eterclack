import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { AuthShell, FormError, FormSuccess } from '@/components/AuthShell';
import { api, ApiError } from '@/lib/api';
import { useAuth } from '@/lib/auth';

type State = 'idle' | 'verifying' | 'done' | 'error';

export function VerifyEmailPage() {
  const [params] = useSearchParams();
  const token = params.get('token');
  const { user, refresh } = useAuth();

  const [state, setState] = useState<State>(token ? 'verifying' : 'idle');
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);

  useEffect(() => {
    if (!token) return;

    let cancelled = false;
    (async () => {
      try {
        await api.post('/api/auth/verify-email', { token });
        if (cancelled) return;
        setState('done');
        refresh();
      } catch (err) {
        if (cancelled) return;
        setState('error');
        setError(err instanceof ApiError ? err.message : 'No pudimos verificar el enlace.');
      }
    })();

    return () => {
      cancelled = true;
    };
    // refresh es estable dentro del provider; solo depende del token
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  async function resend() {
    try {
      await api.post('/api/auth/resend-verification');
      setResent(true);
      setError(null);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'No pudimos reenviar el correo.');
    }
  }

  if (state === 'done') {
    return (
      <AuthShell title="Correo confirmado" subtitle="Tu cuenta quedó activa.">
        <FormSuccess message="Ya puedes solicitar sesiones y reservar fechas." />
        <Link to="/fotografos" className="btn btn-primary w-full">
          Buscar fotógrafos
        </Link>
      </AuthShell>
    );
  }

  if (state === 'verifying') {
    return (
      <AuthShell title="Confirmando tu correo…">
        <div className="skeleton h-11 w-full" />
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title={state === 'error' ? 'El enlace no sirvió' : 'Confirma tu correo'}
      subtitle={
        state === 'error'
          ? 'El enlace pudo vencer o ya fue usado. Pide uno nuevo.'
          : 'Te enviamos un enlace de confirmación. Revisa tu bandeja de entrada.'
      }
    >
      <FormError message={error} />
      <FormSuccess message={resent ? 'Enviamos un enlace nuevo a tu correo.' : null} />

      {user ? (
        <button onClick={resend} className="btn btn-primary w-full" disabled={resent}>
          {resent ? 'Enlace enviado' : 'Reenviar enlace'}
        </button>
      ) : (
        <Link to="/ingresar" className="btn btn-primary w-full">
          Ingresar para reenviar
        </Link>
      )}

      <p className="mt-5 text-xs leading-relaxed text-bone-mute">
        En desarrollo, todos los correos se capturan en{' '}
        <a
          href="http://localhost:8025"
          target="_blank"
          rel="noreferrer"
          className="text-lime hover:underline"
        >
          Mailpit (localhost:8025)
        </a>
        .
      </p>
    </AuthShell>
  );
}
