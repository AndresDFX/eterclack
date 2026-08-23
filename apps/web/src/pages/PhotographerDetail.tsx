import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, formatCOP, ApiError, type PhotographerDetail } from '@/lib/api';
import { ViewfinderCorners } from '@/components/Logo';

const TIER_LABEL: Record<string, string> = {
  ECONOMICO: 'Económico',
  MEDIO: 'Medio',
  ALTO: 'Premium',
};

export function PhotographerDetailPage() {
  const { slug } = useParams<{ slug: string }>();

  const { data, isLoading, error } = useQuery({
    queryKey: ['photographer', slug],
    queryFn: () => api.get<{ photographer: PhotographerDetail }>(`/api/photographers/${slug}`),
    retry: false,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
        <div className="skeleton mb-4 h-12 w-80" />
        <div className="skeleton h-96" />
      </div>
    );
  }

  if (error || !data) {
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <div className="mx-auto max-w-2xl px-4 py-24 text-center">
        <p className="overline mb-4">{notFound ? 'No disponible' : 'Error'}</p>
        <h1 className="text-3xl text-bone">
          {notFound ? 'Ese fotógrafo no está disponible' : 'No pudimos cargar el perfil'}
        </h1>
        <Link to="/fotografos" className="btn btn-primary mt-8">
          Ver otros fotógrafos
        </Link>
      </div>
    );
  }

  const p = data.photographer;

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <Link to="/fotografos" className="link-nav mb-8 text-sm text-bone-dim hover:text-lime">
        ← Volver a la búsqueda
      </Link>

      {/* ── Encabezado ────────────────────────────────────────── */}
      <header className="mb-12 grid gap-8 lg:grid-cols-[1fr_320px]">
        <div>
          <h1 className="text-3xl text-bone sm:text-4xl md:text-5xl">{p.fullName}</h1>
          {p.headline && <p className="mt-4 text-xl text-bone-dim">{p.headline}</p>}

          <div className="mt-6 flex flex-wrap gap-2">
            {p.specialties.map((s) => (
              <span key={s.slug} className="chip chip-active">
                {s.name}
              </span>
            ))}
            {p.zones.map((z) => (
              <span key={z.slug} className="chip">
                {z.name}
              </span>
            ))}
          </div>

          {p.bio && (
            <p className="mt-8 max-w-2xl whitespace-pre-line leading-relaxed text-bone-dim">
              {p.bio}
            </p>
          )}

          {(p.instagram || p.website) && (
            <div className="mt-6 flex gap-5 text-sm">
              {p.instagram && (
                <a
                  href={`https://instagram.com/${p.instagram.replace('@', '')}`}
                  target="_blank"
                  rel="noreferrer"
                  className="text-bone-dim hover:text-lime"
                >
                  Instagram
                </a>
              )}
              {p.website && (
                <a
                  href={p.website}
                  target="_blank"
                  rel="noreferrer"
                  className="text-bone-dim hover:text-lime"
                >
                  Sitio web
                </a>
              )}
            </div>
          )}
        </div>

        {/* Panel de reserva */}
        <aside className="relative h-fit bg-ink-soft p-6 lg:sticky lg:top-24">
          <ViewfinderCorners />
          <p className="overline mb-2">Desde</p>
          <p className="font-[family-name:var(--font-display)] text-3xl font-bold text-lime">
            {formatCOP(p.priceFromCents)}
          </p>
          <p className="mt-2 text-xs text-bone-mute">
            Precio fijo por producto. Sin negociación.
          </p>

          <Link to={`/fotografos/${p.slug}/reservar`} className="btn btn-primary mt-6 w-full">
            Solicitar fecha
          </Link>
          <p className="mt-3 text-center text-[11px] text-bone-mute">
            Elige producto y fecha de su calendario.
          </p>
        </aside>
      </header>

      {/* ── Paquetes ──────────────────────────────────────────── */}
      {p.packages.length > 0 && (
        <section className="mb-16">
          <h2 className="mb-2 text-2xl text-bone">Los tres productos</h2>
          <p className="mb-6 text-sm text-bone-dim">
            Elige uno al reservar. El precio es el que ves.
          </p>
          <div className="grid gap-5 md:grid-cols-3">
            {p.packages.map((pkg) => (
              <article
                key={pkg.id}
                className={`card clack-frame-hover flex flex-col p-6 ${
                  pkg.tier === 'MEDIO' ? 'border-lime/40' : ''
                }`}
              >
                <span className="overline">{TIER_LABEL[pkg.tier]}</span>
                <h3 className="mt-1.5 font-[family-name:var(--font-display)] text-lg font-semibold text-bone">
                  {pkg.name}
                </h3>
                {pkg.description && (
                  <p className="mt-2 text-sm leading-relaxed text-bone-dim">{pkg.description}</p>
                )}

                {pkg.includes.length > 0 && (
                  <ul className="mt-4 space-y-1.5 text-xs text-bone-dim">
                    {pkg.includes.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="text-lime">·</span>
                        {item}
                      </li>
                    ))}
                  </ul>
                )}

                <dl className="mt-5 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <dt className="text-bone-mute">Cobertura</dt>
                    <dd className="text-bone">{pkg.hours} h</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-bone-mute">Fotos seleccionables</dt>
                    <dd className="text-bone">{pkg.maxSelectablePhotos}</dd>
                  </div>
                  <div className="flex justify-between">
                    <dt className="text-bone-mute">Entrega</dt>
                    <dd className="text-bone">{pkg.deliveryDays} días</dd>
                  </div>
                </dl>

                <div className="mt-auto border-t border-ink-line pt-4">
                  <p className="font-[family-name:var(--font-display)] text-2xl font-bold text-bone">
                    {formatCOP(pkg.priceCents)}
                  </p>
                  <Link
                    to={`/fotografos/${p.slug}/reservar?producto=${pkg.id}`}
                    className="btn btn-secondary mt-4 w-full"
                  >
                    Reservar este
                  </Link>
                </div>
              </article>
            ))}
          </div>
        </section>
      )}

      {/* ── Portafolio ────────────────────────────────────────── */}
      <section>
        <h2 className="mb-6 text-2xl text-bone">Portafolio</h2>
        {p.portfolio.length > 0 ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-4">
            {p.portfolio.map((item) => (
              <figure key={item.id} className="clack-frame-hover group aspect-square overflow-hidden bg-ink-soft">
                <img
                  src={item.thumbUrl ?? item.url ?? ''}
                  alt={item.caption ?? ''}
                  loading="lazy"
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                />
              </figure>
            ))}
          </div>
        ) : (
          <div className="card p-12 text-center">
            <p className="text-bone-dim">Este fotógrafo aún no ha cargado su portafolio.</p>
          </div>
        )}
      </section>
    </div>
  );
}
