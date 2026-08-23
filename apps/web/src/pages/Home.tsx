import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, formatCOP, type PhotographerCard, type Specialty } from '@/lib/api';
import { Logo, ViewfinderCorners } from '@/components/Logo';

export function HomePage() {
  const { data: specialtiesData } = useQuery({
    queryKey: ['specialties'],
    queryFn: () => api.get<{ specialties: Specialty[] }>('/api/catalog/specialties'),
  });

  const { data: featured } = useQuery({
    queryKey: ['photographers', 'featured'],
    queryFn: () =>
      api.get<{ photographers: PhotographerCard[] }>('/api/photographers?perPage=3'),
  });

  return (
    <>
      {/* ── Portada ───────────────────────────────────────────── */}
      <section className="relative overflow-hidden border-b border-ink-line">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-32">
          <div className="grid items-center gap-16 lg:grid-cols-[1.1fr_1fr]">
            <div>
              <p className="overline mb-6">Marketplace de fotografía · Colombia</p>
              <h1 className="text-5xl leading-[0.95] text-bone md:text-7xl">
                Tu momento,
                <br />
                <span className="text-lime">para siempre.</span>
              </h1>
              <p className="mt-8 max-w-lg text-lg leading-relaxed text-bone-dim">
                Encuentra fotógrafos profesionales por especialidad, zona y presupuesto. Reserva,
                firma, paga y recibe tus fotos sin salir de la plataforma.
              </p>

              <div className="mt-10 flex flex-col gap-3 sm:flex-row">
                <Link to="/fotografos" className="btn btn-primary">
                  Buscar fotógrafo
                </Link>
                <Link to="/registro?rol=fotografo" className="btn btn-secondary">
                  Soy fotógrafo
                </Link>
              </div>

              <dl className="mt-14 grid max-w-md grid-cols-3 gap-6 border-t border-ink-line pt-8">
                <Stat value="1" label="Contrato claro" />
                <Stat value="100%" label="Pago protegido" />
                <Stat value="24/7" label="Galería privada" />
              </dl>
            </div>

            {/* Composición de marca */}
            <div className="relative hidden aspect-square lg:block">
              <div className="clack-frame absolute inset-8 flex items-center justify-center bg-ink-soft">
                <Logo size="lg" showTagline />
              </div>
              <ViewfinderCorners />
            </div>
          </div>
        </div>
      </section>

      {/* ── Especialidades ────────────────────────────────────── */}
      <section className="border-b border-ink-line">
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
          <div className="mb-10 flex items-end justify-between gap-4">
            <div>
              <p className="overline mb-3">Especialidades</p>
              <h2 className="text-3xl text-bone md:text-4xl">¿Qué necesitas fotografiar?</h2>
            </div>
            <Link to="/fotografos" className="link-nav hidden text-sm text-lime hover:underline sm:inline-flex">
              Ver todos →
            </Link>
          </div>

          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {specialtiesData?.specialties.map((s) => (
              <Link
                key={s.id}
                to={`/fotografos?specialty=${s.slug}`}
                className="card card-interactive clack-frame-hover group p-6"
              >
                <span className="block font-[family-name:var(--font-display)] text-lg font-semibold text-bone transition-colors group-hover:text-lime">
                  {s.name}
                </span>
              </Link>
            )) ??
              Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="skeleton h-[76px]" />
              ))}
          </div>
        </div>
      </section>

      {/* ── Cómo funciona ─────────────────────────────────────── */}
      <section className="border-b border-ink-line">
        <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
          <p className="overline mb-3">El proceso</p>
          <h2 className="mb-14 text-3xl text-bone md:text-4xl">De la búsqueda a tus fotos</h2>

          <ol className="grid gap-10 md:grid-cols-4">
            {[
              {
                n: '01',
                t: 'Encuentra',
                d: 'Filtra por especialidad, zona y presupuesto. Compara portafolios y paquetes.',
              },
              {
                n: '02',
                t: 'Reserva',
                d: 'Envía tu solicitud con fecha y necesidad. El fotógrafo confirma o ajusta la propuesta.',
              },
              {
                n: '03',
                t: 'Firma y paga',
                d: 'Aceptas un contrato con evidencia y pagas de forma segura. La fecha queda bloqueada.',
              },
              {
                n: '04',
                t: 'Recibe',
                d: 'Seleccionas tus favoritas en una galería privada y descargas los archivos finales.',
              },
            ].map((step) => (
              <li key={step.n} className="relative border-t-2 border-ink-line pt-6">
                <span className="absolute -top-px left-0 h-0.5 w-10 bg-lime" />
                <span className="font-[family-name:var(--font-display)] text-sm font-bold text-lime">
                  {step.n}
                </span>
                <h3 className="mt-3 text-xl text-bone">{step.t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-bone-dim">{step.d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ── Fotógrafos destacados ─────────────────────────────── */}
      {featured?.photographers && featured.photographers.length > 0 && (
        <section className="border-b border-ink-line">
          <div className="mx-auto max-w-7xl px-4 py-16 md:px-8 md:py-24">
            <div className="mb-10 flex items-end justify-between gap-4">
              <div>
                <p className="overline mb-3">Portafolios</p>
                <h2 className="text-3xl text-bone md:text-4xl">Fotógrafos en la plataforma</h2>
              </div>
            </div>

            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {featured.photographers.map((p) => (
                <Link
                  key={p.id}
                  to={`/fotografos/${p.slug}`}
                  className="card card-interactive clack-frame-hover group p-6"
                >
                  <h3 className="font-[family-name:var(--font-display)] text-xl font-semibold text-bone transition-colors group-hover:text-lime">
                    {p.fullName}
                  </h3>
                  {p.headline && (
                    <p className="mt-2 text-sm leading-relaxed text-bone-dim">{p.headline}</p>
                  )}
                  <div className="mt-4 flex flex-wrap gap-1.5">
                    {p.specialties.slice(0, 3).map((s) => (
                      <span key={s.slug} className="chip">
                        {s.name}
                      </span>
                    ))}
                  </div>
                  <p className="mt-5 border-t border-ink-line pt-4 text-sm text-bone-mute">
                    Desde{' '}
                    <span className="font-semibold text-bone">{formatCOP(p.priceFromCents)}</span>
                  </p>
                </Link>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* ── Llamado final ─────────────────────────────────────── */}
      <section className="relative">
        <div className="mx-auto max-w-7xl px-4 py-20 md:px-8 md:py-28">
          <div className="clack-frame relative bg-ink-soft px-8 py-16 text-center md:px-16 md:py-20">
            <p className="overline mb-4">¿Eres fotógrafo?</p>
            <h2 className="mx-auto max-w-2xl text-3xl text-bone md:text-5xl">
              Recibe clientes, no solo mensajes.
            </h2>
            <p className="mx-auto mt-6 max-w-xl text-bone-dim">
              Publica tu portafolio, define tus paquetes y administra agenda, galerías y pagos desde
              un solo panel.
            </p>
            <Link to="/registro?rol=fotografo" className="btn btn-primary mt-10">
              Postularme
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div>
      <dt className="font-[family-name:var(--font-display)] text-2xl font-bold text-lime">
        {value}
      </dt>
      <dd className="mt-1 text-xs leading-snug text-bone-mute">{label}</dd>
    </div>
  );
}
