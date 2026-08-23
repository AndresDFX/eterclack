import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, formatCOP } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { StatusBadge, formatDate, formatDateTime } from '@/components/StatusBadge';
import { TURN_LABEL } from '@/components/Calendar';
import { ViewfinderCorners } from '@/components/Logo';

type Order = {
  id: string;
  code: string;
  status: string;
  eventDate: string;
  amountCents: string;
  commissionBps: number;
  commissionCents: string;
  photographerCents: string;
  maxSelectablePhotos: number;
  createdAt: string;
  client: { id: string; fullName: string; email: string };
  photographer: { slug: string; user: { fullName: string; email: string } };
  contract: { acceptedAt: string; acceptedByName: string; templateVersion: number } | null;
  notes: string | null;
  package: {
    tier: string;
    name: string;
    description: string | null;
    includes: string[];
    hours: number;
    deliveryDays: number;
    maxSelectablePhotos: number;
  };
  slot: { id: string; date: string; turn: 'MANANA' | 'TARDE' | 'DIA_COMPLETO'; status: string; holdExpiresAt: string | null };
  zone: { name: string };
  specialty: { name: string };
  payments: { id: string; status: string; amountCents: string; reference: string }[];
};

type Contract = {
  version: number;
  body: string;
  accepted: boolean;
  acceptedAt?: string;
  acceptedByName?: string;
};

export function OrdenPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const qc = useQueryClient();

  const [fullName, setFullName] = useState('');
  const [checked, setChecked] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['order', id],
    queryFn: () => api.get<{ order: Order }>(`/api/orders/${id}`),
    retry: false,
  });

  const { data: contractData } = useQuery({
    queryKey: ['contract', id],
    queryFn: () => api.get<{ contract: Contract }>(`/api/orders/${id}/contract`),
    retry: false,
  });

  const acceptContract = useMutation({
    mutationFn: () => api.post(`/api/orders/${id}/contract/accept`, { fullName, accept: true }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['order', id] });
      qc.invalidateQueries({ queryKey: ['contract', id] });
      setError(null);
    },
    onError: (e) =>
      setError(e instanceof ApiError ? e.message : 'No pudimos registrar la aceptación.'),
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-12 md:px-8">
        <div className="skeleton h-12 w-72" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <h1 className="text-3xl text-bone">No encontramos esa orden</h1>
        <Link to="/mis-citas" className="btn btn-primary mt-8">
          Ver mis solicitudes
        </Link>
      </div>
    );
  }

  const o = data.order;
  const contract = contractData?.contract;
  const isClient = user?.id === o.client.id;
  const canAccept = isClient && contract && !contract.accepted && o.status === 'BORRADOR';

  function handleAccept(e: FormEvent) {
    e.preventDefault();
    acceptContract.mutate();
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-8">
      <Link to={isClient ? '/mis-citas' : '/panel/citas'} className="link-nav mb-8 text-sm text-bone-dim hover:text-lime">
        ← Volver
      </Link>

      <header className="mb-10">
        <div className="flex flex-wrap items-center gap-3">
          <p className="overline">{o.code}</p>
          <StatusBadge status={o.status} kind="order" />
        </div>
        <h1 className="mt-3 text-3xl text-bone sm:text-4xl">
          {isClient ? o.photographer.user.fullName : o.client.fullName}
        </h1>
        <p className="mt-2 text-bone-dim">
          {o.specialty.name} · {o.zone.name} · {formatDate(o.eventDate)} · {TURN_LABEL[o.slot.turn]}
        </p>
      </header>

      {/* ── Resumen económico ───────────────────────────────── */}
      <section className="card mb-8 p-6">
        <h2 className="mb-5 text-xl text-bone">Resumen</h2>
        <dl className="space-y-3">
          <Row label="Valor acordado" value={formatCOP(o.amountCents)} strong />
          {/* Al fotógrafo le importa su neto; al cliente, solo el total. */}
          {!isClient && (
            <>
              <Row
                label={`Comisión de la plataforma (${(o.commissionBps / 100).toFixed(2)} %)`}
                value={`− ${formatCOP(o.commissionCents)}`}
                muted
              />
              <div className="border-t border-ink-line pt-3">
                <Row label="Recibes" value={formatCOP(o.photographerCents)} strong accent />
              </div>
            </>
          )}
          <Row
            label="Producto"
            value={`${o.package.name} · ${o.package.hours} h · ${o.package.deliveryDays} días · hasta ${o.maxSelectablePhotos} fotos`}
          />
        </dl>
      </section>

      {/* ── Contrato ────────────────────────────────────────── */}
      <section className="card mb-8">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink-line p-6">
          <h2 className="text-xl text-bone">Contrato</h2>
          {contract?.accepted ? (
            <span className="chip border-success text-success">Aceptado</span>
          ) : (
            <span className="chip border-warn text-warn">Pendiente de aceptación</span>
          )}
        </div>

        {contract ? (
          <>
            <div className="max-h-96 overflow-y-auto border-b border-ink-line p-6">
              <pre className="whitespace-pre-wrap font-[family-name:var(--font-sans)] text-sm leading-relaxed text-bone-dim">
                {contract.body}
              </pre>
            </div>

            {contract.accepted ? (
              <div className="p-6">
                <p className="overline mb-3">Evidencia de aceptación</p>
                <dl className="space-y-2 text-sm">
                  <Row label="Aceptado por" value={contract.acceptedByName ?? '—'} />
                  <Row
                    label="Fecha y hora"
                    value={contract.acceptedAt ? formatDateTime(contract.acceptedAt) : '—'}
                  />
                  <Row label="Versión de la plantilla" value={`v${contract.version}`} />
                </dl>
                <p className="mt-4 text-xs leading-relaxed text-bone-mute">
                  Se guardó el texto exacto que se aceptó, junto con la IP y el navegador. Este
                  registro no se modifica.
                </p>
              </div>
            ) : canAccept ? (
              <form onSubmit={handleAccept} className="p-6">
                {error && (
                  <div role="alert" className="mb-5 border-l-2 border-danger bg-danger/10 px-4 py-3 text-sm">
                    {error}
                  </div>
                )}

                <label className="label">Escribe tu nombre completo</label>
                <input
                  type="text"
                  className="field mb-4"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder={o.client.fullName}
                  required
                  minLength={3}
                />

                <label className="check-row mb-5 text-sm text-bone-dim">
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={(e) => setChecked(e.target.checked)}
                    className="checkbox mt-0.5"
                  />
                  <span>
                    He leído y acepto el contrato. Entiendo que se registrará mi nombre, la fecha, la
                    hora y mi dirección IP como evidencia.
                  </span>
                </label>

                <button
                  type="submit"
                  className="btn btn-primary"
                  disabled={!checked || fullName.trim().length < 3 || acceptContract.isPending}
                >
                  {acceptContract.isPending ? 'Registrando…' : 'Aceptar contrato'}
                </button>
              </form>
            ) : (
              <p className="p-6 text-sm text-bone-dim">
                El cliente debe aceptar el contrato para continuar.
              </p>
            )}
          </>
        ) : (
          <div className="skeleton m-6 h-40" />
        )}
      </section>

      {/* ── Pago (Fase 5) ───────────────────────────────────── */}
      {o.status === 'PAGO_PENDIENTE' && (
        <section className="relative bg-ink-soft p-8 text-center">
          <ViewfinderCorners />
          <p className="overline mb-3">Siguiente paso</p>
          <h2 className="text-2xl text-bone">Pago de {formatCOP(o.amountCents)}</h2>
          <p className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-bone-dim">
            La reserva se confirma solo cuando Wompi aprueba el pago. Ahí se bloquea la fecha en la
            agenda del fotógrafo.
          </p>
          <button className="btn btn-primary mt-8" disabled title="Disponible en la Fase 5">
            Pagar con Wompi
          </button>
          <p className="mt-3 text-xs text-bone-mute">La integración de pagos llega en la Fase 5.</p>
        </section>
      )}
    </div>
  );
}

function Row({
  label,
  value,
  strong,
  muted,
  accent,
}: {
  label: string;
  value: string;
  strong?: boolean;
  muted?: boolean;
  accent?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className={`text-sm ${muted ? 'text-bone-mute' : 'text-bone-dim'}`}>{label}</dt>
      <dd
        className={
          strong
            ? `font-[family-name:var(--font-display)] text-xl font-bold ${accent ? 'text-lime' : 'text-bone'}`
            : `text-sm ${muted ? 'text-bone-mute' : 'text-bone'}`
        }
      >
        {value}
      </dd>
    </div>
  );
}
