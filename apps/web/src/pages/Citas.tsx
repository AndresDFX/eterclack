import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, formatCOP } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { StatusBadge, formatDate } from '@/components/StatusBadge';
import { TURN_LABEL } from '@/components/Calendar';
import { PanelNav } from '@/components/PanelNav';

type OrderRow = {
  id: string;
  code: string;
  status: string;
  eventDate: string;
  amountCents: string;
  commissionCents: string;
  photographerCents: string;
  createdAt: string;
  client: { fullName: string };
  photographer: { slug: string; user: { fullName: string } };
  contract: { acceptedAt: string } | null;
  package: { tier: string; name: string };
  slot: { turn: 'MANANA' | 'TARDE' | 'DIA_COMPLETO'; status: string };
  zone: { name: string };
  specialty: { name: string };
};

const TIER_LABEL: Record<string, string> = {
  ECONOMICO: 'Económico',
  MEDIO: 'Medio',
  ALTO: 'Premium',
};

/** Misma vista para cliente y fotógrafo; cambia el punto de vista. */
export function CitasPage({ role }: { role: 'CLIENT' | 'PHOTOGRAPHER' }) {
  const { user } = useAuth();

  const { data, isLoading } = useQuery({
    queryKey: ['orders'],
    queryFn: () => api.get<{ orders: OrderRow[] }>('/api/orders'),
  });

  const orders = data?.orders ?? [];
  const upcoming = orders.filter((o) => !['COMPLETADA', 'CANCELADA'].includes(o.status));
  const past = orders.filter((o) => ['COMPLETADA', 'CANCELADA'].includes(o.status));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-8">
      <header className="mb-8">
        <p className="overline mb-3">
          {role === 'CLIENT' ? 'Mi actividad' : 'Panel del fotógrafo'}
        </p>
        <h1 className="text-3xl text-bone sm:text-4xl">Mis citas</h1>
      </header>

      {role === 'PHOTOGRAPHER' && <PanelNav active="citas" />}

      {isLoading ? (
        <div className="space-y-4">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="skeleton h-40" />
          ))}
        </div>
      ) : orders.length === 0 ? (
        <div className="card p-16 text-center">
          <p className="text-lg text-bone">
            {role === 'CLIENT' ? 'Todavía no tienes citas' : 'Aún no te han reservado'}
          </p>
          <p className="mt-2 text-sm text-bone-dim">
            {role === 'CLIENT'
              ? 'Busca un fotógrafo, elige un producto y aparta una fecha.'
              : 'Publica disponibilidad en tu calendario para que puedan reservarte.'}
          </p>
          <Link
            to={role === 'CLIENT' ? '/fotografos' : '/panel/agenda'}
            className="btn btn-primary mt-8"
          >
            {role === 'CLIENT' ? 'Buscar fotógrafos' : 'Abrir mi calendario'}
          </Link>
        </div>
      ) : (
        <>
          <Section title="Próximas" orders={upcoming} role={role} userName={user?.fullName} />
          {past.length > 0 && (
            <Section title="Histórico" orders={past} role={role} userName={user?.fullName} />
          )}
        </>
      )}
    </div>
  );
}

function Section({
  title,
  orders,
  role,
}: {
  title: string;
  orders: OrderRow[];
  role: 'CLIENT' | 'PHOTOGRAPHER';
  userName?: string;
}) {
  if (orders.length === 0) return null;

  return (
    <section className="mb-10">
      <h2 className="overline mb-4">{title}</h2>
      <div className="space-y-4">
        {orders.map((o) => (
          <article key={o.id} className="card p-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="overline">{o.code}</span>
                  <StatusBadge status={o.status} kind="order" />
                </div>

                <h3 className="mt-2 text-xl text-bone">
                  {role === 'CLIENT' ? (
                    <Link to={`/fotografos/${o.photographer.slug}`} className="hover:text-lime">
                      {o.photographer.user.fullName}
                    </Link>
                  ) : (
                    o.client.fullName
                  )}
                </h3>

                <dl className="mt-3 flex flex-wrap gap-x-8 gap-y-2 text-sm">
                  <Pair label="Fecha" value={formatDate(o.eventDate)} />
                  <Pair label="Franja" value={TURN_LABEL[o.slot.turn]} />
                  <Pair
                    label="Producto"
                    value={`${TIER_LABEL[o.package.tier] ?? o.package.tier} · ${o.package.name}`}
                  />
                  <Pair label="Zona" value={o.zone.name} />
                </dl>
              </div>

              <div className="text-right">
                <p className="overline">{role === 'CLIENT' ? 'Total' : 'Recibes'}</p>
                <p className="mt-1 font-[family-name:var(--font-display)] text-xl font-bold text-lime">
                  {formatCOP(role === 'CLIENT' ? o.amountCents : o.photographerCents)}
                </p>
              </div>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3 border-t border-ink-line pt-5">
              <Link to={`/ordenes/${o.id}`} className="btn btn-secondary">
                Ver detalle
              </Link>
              {role === 'CLIENT' && o.status === 'BORRADOR' && (
                <span className="text-xs text-warn">
                  Falta aceptar el contrato para confirmar la fecha
                </span>
              )}
              {role === 'CLIENT' && o.status === 'PAGO_PENDIENTE' && (
                <span className="text-xs text-warn">Falta el pago para confirmar la reserva</span>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Pair({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-bone-mute">{label}</dt>
      <dd className="mt-0.5 text-bone">{value}</dd>
    </div>
  );
}
