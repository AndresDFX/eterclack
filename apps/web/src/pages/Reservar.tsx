import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, ApiError, formatCOP, type PhotographerDetail, type Package } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { Calendar, CalendarLegend, TURN_LABEL, type Slot } from '@/components/Calendar';
import { ViewfinderCorners } from '@/components/Logo';
import { formatDate } from '@/components/StatusBadge';

const TIER_ORDER = ['ECONOMICO', 'MEDIO', 'ALTO'] as const;
const TIER_LABEL: Record<string, string> = {
  ECONOMICO: 'Económico',
  MEDIO: 'Medio',
  ALTO: 'Premium',
};

export function ReservarPage() {
  const { slug } = useParams<{ slug: string }>();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [packageId, setPackageId] = useState(params.get('producto') ?? '');
  const [day, setDay] = useState<string | null>(null);
  const [slotId, setSlotId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [error, setError] = useState<string | null>(null);

  const { data } = useQuery({
    queryKey: ['photographer', slug],
    queryFn: () => api.get<{ photographer: PhotographerDetail }>(`/api/photographers/${slug}`),
  });

  const { data: slotsData, refetch } = useQuery({
    queryKey: ['slots', slug],
    queryFn: () => api.get<{ slots: Slot[] }>(`/api/photographers/${slug}/slots`),
  });

  const book = useMutation({
    mutationFn: () =>
      api.post<{ order: { id: string } }>('/api/bookings', {
        slotId,
        packageId,
        notes: notes || undefined,
      }),
    onSuccess: (res) => navigate(`/ordenes/${res.order.id}`, { replace: true }),
    onError: (e) => {
      setError(e instanceof ApiError ? e.message : 'No pudimos crear la reserva.');
      // Si alguien se adelantó, el calendario debe reflejarlo de inmediato.
      refetch();
      setSlotId(null);
    },
  });

  const p = data?.photographer;
  const slots = slotsData?.slots ?? [];
  const daySlots = day ? slots.filter((s) => s.date === day) : [];
  const selectedPackage = p?.packages.find((k) => k.id === packageId);
  const ready = Boolean(packageId && slotId);

  // ── Puertas de acceso ──────────────────────────────────────
  if (!user) {
    return (
      <Gate title="Ingresa para reservar" detail="Necesitas una cuenta para agendar una cita.">
        <Link to="/ingresar" className="btn btn-primary">Ingresar</Link>
        <Link to="/registro" className="btn btn-secondary">Crear cuenta</Link>
      </Gate>
    );
  }
  if (user.role !== 'CLIENT') {
    return (
      <Gate title="Solo los clientes reservan" detail="Tu cuenta es de fotógrafo o administración.">
        <Link to="/fotografos" className="btn btn-secondary">Volver</Link>
      </Gate>
    );
  }
  if (!user.emailVerified) {
    return (
      <Gate
        title="Confirma tu correo"
        detail="Pedimos el correo verificado antes de apartar una fecha en la agenda de un fotógrafo."
      >
        <Link to="/verificar" className="btn btn-primary">Confirmar mi correo</Link>
      </Gate>
    );
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-8">
      <Link to={`/fotografos/${slug}`} className="link-nav mb-8 text-sm text-bone-dim hover:text-lime">
        ← Volver al perfil
      </Link>

      <header className="mb-10">
        <p className="overline mb-3">Reservar cita</p>
        <h1 className="text-3xl text-bone sm:text-4xl">{p?.fullName ?? '…'}</h1>
        <p className="mt-3 text-bone-dim">
          Elige un producto y una fecha de su calendario. El precio es fijo: no hay negociación.
        </p>
      </header>

      {error && (
        <div role="alert" className="mb-6 border-l-2 border-danger bg-danger/10 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── Paso 1: producto ──────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-5 flex items-baseline gap-3">
          <span className="font-[family-name:var(--font-display)] text-sm font-bold text-lime">01</span>
          <h2 className="text-xl text-bone sm:text-2xl">Elige tu producto</h2>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TIER_ORDER.map((tier) => {
            const pkg = p?.packages.find((k) => k.tier === tier);
            if (!pkg) return <div key={tier} className="skeleton h-64" />;
            return (
              <TierCard
                key={pkg.id}
                pkg={pkg}
                selected={packageId === pkg.id}
                onSelect={() => setPackageId(pkg.id)}
              />
            );
          })}
        </div>
      </section>

      {/* ── Paso 2: fecha ─────────────────────────────────── */}
      <section className="mb-10">
        <div className="mb-5 flex items-baseline gap-3">
          <span className="font-[family-name:var(--font-display)] text-sm font-bold text-lime">02</span>
          <h2 className="text-xl text-bone sm:text-2xl">Elige la fecha</h2>
        </div>

        {slots.length === 0 ? (
          <div className="card p-12 text-center">
            <p className="text-bone">Sin fechas publicadas</p>
            <p className="mt-2 text-sm text-bone-dim">
              Este fotógrafo aún no ha abierto su agenda. Vuelve pronto.
            </p>
          </div>
        ) : (
          <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
            <div className="card p-5">
              <Calendar
                slots={slots}
                value={day}
                onSelectDay={(d) => {
                  setDay(d);
                  setSlotId(null);
                }}
              />
              <CalendarLegend
                items={[
                  { className: 'border-bone-mute/50', label: 'Con cupo' },
                  { className: 'border-lime bg-lime/20', label: 'Día elegido' },
                  { className: 'border-ink-line', label: 'Sin cupo' },
                ]}
              />
            </div>

            <div className="card p-5">
              <p className="overline mb-4">Franja</p>
              {!day ? (
                <p className="text-sm text-bone-mute">Elige primero un día del calendario.</p>
              ) : daySlots.length === 0 ? (
                <p className="text-sm text-bone-mute">Sin cupo ese día.</p>
              ) : (
                <div className="flex flex-col gap-2">
                  {daySlots.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => setSlotId(s.id)}
                      className={`opt ${slotId === s.id ? 'opt-active bg-lime/10' : 'text-bone'}`}
                    >
                      {TURN_LABEL[s.turn]}
                      {s.note && <span className="mt-1 block text-xs text-bone-mute">{s.note}</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </section>

      {/* ── Paso 3: confirmar ─────────────────────────────── */}
      <section>
        <div className="mb-5 flex items-baseline gap-3">
          <span className="font-[family-name:var(--font-display)] text-sm font-bold text-lime">03</span>
          <h2 className="text-xl text-bone sm:text-2xl">Confirma</h2>
        </div>

        <div className="card p-6">
          <label className="label">Detalles para el fotógrafo (opcional)</label>
          <textarea
            className="field mb-6 min-h-28"
            maxLength={1000}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Lugar exacto, número de personas, horario preferido, estilo que buscas…"
          />

          <div className="clack-frame bg-ink p-5">
            <dl className="space-y-2 text-sm">
              <Row label="Producto" value={selectedPackage ? `${TIER_LABEL[selectedPackage.tier]} · ${selectedPackage.name}` : 'Sin elegir'} />
              <Row label="Fecha" value={day ? formatDate(`${day}T00:00:00Z`) : 'Sin elegir'} />
              <Row
                label="Franja"
                value={slotId ? TURN_LABEL[daySlots.find((s) => s.id === slotId)!.turn] : 'Sin elegir'}
              />
              <div className="border-t border-ink-line pt-3">
                <div className="flex items-baseline justify-between">
                  <dt className="text-bone-dim">Total</dt>
                  <dd className="font-[family-name:var(--font-display)] text-2xl font-bold text-lime">
                    {selectedPackage ? formatCOP(selectedPackage.priceCents) : '—'}
                  </dd>
                </div>
              </div>
            </dl>
          </div>

          <button
            onClick={() => book.mutate()}
            className="btn btn-primary mt-6 w-full"
            disabled={!ready || book.isPending}
          >
            {book.isPending ? 'Reservando…' : 'Apartar esta fecha'}
          </button>

          <p className="mt-4 text-center text-xs leading-relaxed text-bone-mute">
            Apartamos la fecha por 24 horas. Se confirma cuando aceptes el contrato y pagues; si no,
            vuelve a quedar libre.
          </p>
        </div>
      </section>
    </div>
  );
}

function TierCard({
  pkg,
  selected,
  onSelect,
}: {
  pkg: Package;
  selected: boolean;
  onSelect: () => void;
}) {
  const featured = pkg.tier === 'MEDIO';

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`relative flex flex-col border p-6 text-left transition-colors ${
        selected ? 'border-lime bg-lime/10' : 'border-ink-line bg-ink-soft hover:border-bone-mute'
      }`}
    >
      {featured && !selected && (
        <span className="absolute -top-px right-4 bg-lime px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-ink">
          Más elegido
        </span>
      )}

      <span className="overline">{TIER_LABEL[pkg.tier]}</span>
      <span className="mt-2 font-[family-name:var(--font-display)] text-xl font-bold text-bone">
        {pkg.name}
      </span>
      <span
        className={`mt-3 font-[family-name:var(--font-display)] text-2xl font-bold ${
          selected ? 'text-lime' : 'text-bone'
        }`}
      >
        {formatCOP(pkg.priceCents)}
      </span>

      {pkg.description && (
        <span className="mt-3 text-sm leading-relaxed text-bone-dim">{pkg.description}</span>
      )}

      <ul className="mt-4 space-y-1.5 text-xs text-bone-dim">
        {pkg.includes?.map((item) => (
          <li key={item} className="flex gap-2">
            <span className="text-lime">·</span>
            {item}
          </li>
        ))}
      </ul>

      <span className="mt-auto border-t border-ink-line pt-4 text-xs text-bone-mute">
        {pkg.hours} h · hasta {pkg.maxSelectablePhotos} fotos · entrega en {pkg.deliveryDays} días
      </span>
    </button>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-2">
      <dt className="text-bone-mute">{label}</dt>
      <dd className="text-bone">{value}</dd>
    </div>
  );
}

function Gate({ title, detail, children }: { title: string; detail: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto max-w-xl px-4 py-24">
      <div className="relative bg-ink-soft p-10 text-center">
        <ViewfinderCorners />
        <h1 className="text-2xl text-bone">{title}</h1>
        <p className="mt-4 text-bone-dim">{detail}</p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">{children}</div>
      </div>
    </div>
  );
}
