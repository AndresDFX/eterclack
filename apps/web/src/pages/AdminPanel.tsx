import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, formatCOP } from '@/lib/api';

type AdminPhotographer = {
  id: string;
  slug: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  headline: string | null;
  bio: string | null;
  priceFromCents: string | null;
  createdAt: string;
  rejectionReason: string | null;
  bankVerifiedAt: string | null;
  user: { id: string; fullName: string; email: string; phone: string | null; emailVerifiedAt: string | null };
  specialties: string[];
  zones: string[];
  _count: { portfolio: number; packages: number };
};

type Dashboard = {
  metrics: {
    clients: number;
    photographersApproved: number;
    photographersPending: number;
    ordersByStatus: Record<string, number>;
    emailsFailed: number;
  };
};

const TABS = [
  { key: 'PENDING', label: 'Pendientes' },
  { key: 'APPROVED', label: 'Aprobados' },
  { key: 'REJECTED', label: 'Rechazados' },
  { key: 'SUSPENDED', label: 'Suspendidos' },
] as const;

export function AdminPanelPage() {
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('PENDING');
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data: dash } = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => api.get<Dashboard>('/api/admin/dashboard'),
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-photographers', tab],
    queryFn: () =>
      api.get<{ total: number; photographers: AdminPhotographer[] }>(
        `/api/admin/photographers?status=${tab}`,
      ),
  });

  function invalidate() {
    qc.invalidateQueries({ queryKey: ['admin-photographers'] });
    qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
  }

  const approve = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/photographers/${id}/approve`),
    onSuccess: invalidate,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'No pudimos aprobar.'),
  });

  const reject = useMutation({
    mutationFn: (vars: { id: string; reason: string }) =>
      api.post(`/api/admin/photographers/${vars.id}/reject`, { reason: vars.reason }),
    onSuccess: () => {
      setRejecting(null);
      setReason('');
      invalidate();
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : 'No pudimos rechazar.'),
  });

  const suspend = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/photographers/${id}/suspend`),
    onSuccess: invalidate,
  });

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <header className="mb-10">
        <p className="overline mb-3">Administración</p>
        <h1 className="text-3xl text-bone sm:text-4xl">Panel de control</h1>
      </header>

      {/* ── Indicadores ───────────────────────────────────────── */}
      <div className="mb-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Clientes activos" value={dash?.metrics.clients} />
        <Metric
          label="Fotógrafos publicados"
          value={dash?.metrics.photographersApproved}
          tone="success"
        />
        <Metric
          label="Pendientes de revisión"
          value={dash?.metrics.photographersPending}
          tone={dash?.metrics.photographersPending ? 'warn' : undefined}
        />
        <Metric
          label="Correos fallidos"
          value={dash?.metrics.emailsFailed}
          tone={dash?.metrics.emailsFailed ? 'danger' : undefined}
        />
      </div>

      {/* ── Revisión de fotógrafos ────────────────────────────── */}
      <section>
        <h2 className="mb-6 text-2xl text-bone">Fotógrafos</h2>

        <div className="mb-6 flex flex-wrap gap-2 border-b border-ink-line pb-4">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`inline-flex min-h-11 items-center px-4 py-2 text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'border-b-2 border-lime text-lime'
                  : 'text-bone-dim hover:text-bone'
              }`}
            >
              {t.label}
              {t.key === 'PENDING' && dash?.metrics.photographersPending ? (
                <span className="ml-2 bg-warn px-1.5 py-0.5 text-[10px] font-bold text-ink">
                  {dash.metrics.photographersPending}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {error && (
          <div role="alert" className="mb-5 border-l-2 border-danger bg-danger/10 px-4 py-3 text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <div className="space-y-4">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="skeleton h-40" />
            ))}
          </div>
        ) : data && data.photographers.length > 0 ? (
          <div className="space-y-4">
            {data.photographers.map((p) => (
              <article key={p.id} className="card p-6">
                <div className="flex flex-wrap items-start justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-bone">
                        {p.user.fullName}
                      </h3>
                      {!p.user.emailVerifiedAt && (
                        <span className="chip border-warn text-warn">Correo sin verificar</span>
                      )}
                      {p.bankVerifiedAt && (
                        <span className="chip border-success text-success">KYC bancario ✓</span>
                      )}
                    </div>

                    <p className="mt-1 text-sm text-bone-mute">
                      {p.user.email}
                      {p.user.phone && ` · ${p.user.phone}`}
                    </p>

                    {p.headline && <p className="mt-3 text-bone-dim">{p.headline}</p>}
                    {p.bio && (
                      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-bone-mute">
                        {p.bio}
                      </p>
                    )}

                    <div className="mt-4 flex flex-wrap gap-1.5">
                      {p.specialties.map((s) => (
                        <span key={s} className="chip">
                          {s}
                        </span>
                      ))}
                      {p.zones.map((z) => (
                        <span key={z} className="chip">
                          {z}
                        </span>
                      ))}
                    </div>

                    <dl className="mt-4 flex flex-wrap gap-6 border-t border-ink-line pt-4 text-xs">
                      <Detail label="Desde" value={formatCOP(p.priceFromCents)} />
                      <Detail label="Portafolio" value={`${p._count.portfolio} imágenes`} />
                      <Detail label="Paquetes" value={String(p._count.packages)} />
                      <Detail
                        label="Postulado"
                        value={new Date(p.createdAt).toLocaleDateString('es-CO')}
                      />
                    </dl>

                    {p.rejectionReason && (
                      <p className="mt-4 border-l-2 border-danger pl-4 text-sm text-bone-dim">
                        <span className="text-danger">Motivo del rechazo: </span>
                        {p.rejectionReason}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 flex-col gap-2">
                    {p.status !== 'APPROVED' && (
                      <button
                        onClick={() => approve.mutate(p.id)}
                        className="btn btn-primary"
                        disabled={approve.isPending}
                      >
                        Aprobar
                      </button>
                    )}
                    {p.status === 'PENDING' && (
                      <button onClick={() => setRejecting(p.id)} className="btn btn-secondary">
                        Rechazar
                      </button>
                    )}
                    {p.status === 'APPROVED' && (
                      <button onClick={() => suspend.mutate(p.id)} className="btn btn-danger">
                        Suspender
                      </button>
                    )}
                  </div>
                </div>

                {/* Rechazo con motivo obligatorio: el fotógrafo debe saber qué corregir. */}
                {rejecting === p.id && (
                  <div className="mt-6 border-t border-ink-line pt-6">
                    <label className="label">Motivo del rechazo</label>
                    <textarea
                      className="field min-h-24"
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      placeholder="Explica con claridad qué debe corregir. Se le envía por correo."
                      minLength={10}
                    />
                    <div className="mt-3 flex gap-2">
                      <button
                        onClick={() => reject.mutate({ id: p.id, reason })}
                        className="btn btn-primary"
                        disabled={reason.trim().length < 10 || reject.isPending}
                      >
                        {reject.isPending ? 'Enviando…' : 'Confirmar rechazo'}
                      </button>
                      <button
                        onClick={() => {
                          setRejecting(null);
                          setReason('');
                        }}
                        className="btn btn-secondary"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="card p-16 text-center">
            <p className="text-bone-dim">No hay fotógrafos en este estado.</p>
          </div>
        )}
      </section>
    </div>
  );
}

function Metric({
  label,
  value,
  tone,
}: {
  label: string;
  value?: number;
  tone?: 'success' | 'warn' | 'danger';
}) {
  const color =
    tone === 'success'
      ? 'text-success'
      : tone === 'warn'
        ? 'text-warn'
        : tone === 'danger'
          ? 'text-danger'
          : 'text-bone';

  return (
    <div className="card p-6">
      <p className="overline mb-3">{label}</p>
      {value === undefined ? (
        <div className="skeleton h-9 w-16" />
      ) : (
        <p className={`font-[family-name:var(--font-display)] text-3xl font-bold ${color}`}>
          {value}
        </p>
      )}
    </div>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-bone-mute">{label}</dt>
      <dd className="mt-0.5 text-bone">{value}</dd>
    </div>
  );
}
