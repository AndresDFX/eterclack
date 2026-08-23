import { Link, useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { api, formatCOP, type PhotographerCard, type Specialty, type Zone } from '@/lib/api';

type SearchResponse = {
  total: number;
  page: number;
  pages: number;
  photographers: PhotographerCard[];
};

const PRICE_RANGES = [
  { label: 'Cualquiera', min: '', max: '' },
  { label: 'Hasta $500.000', min: '', max: '50000000' },
  { label: '$500.000 – $1.500.000', min: '50000000', max: '150000000' },
  { label: '$1.500.000 – $3.000.000', min: '150000000', max: '300000000' },
  { label: 'Más de $3.000.000', min: '300000000', max: '' },
];

export function PhotographersPage() {
  const [params, setParams] = useSearchParams();

  const specialty = params.get('specialty') ?? '';
  const zone = params.get('zone') ?? '';
  const q = params.get('q') ?? '';
  const minCents = params.get('minCents') ?? '';
  const maxCents = params.get('maxCents') ?? '';
  const sort = params.get('sort') ?? 'recientes';
  const page = Number(params.get('page') ?? '1');

  const { data: catalog } = useQuery({
    queryKey: ['catalog'],
    queryFn: async () => {
      const [s, z] = await Promise.all([
        api.get<{ specialties: Specialty[] }>('/api/catalog/specialties'),
        api.get<{ zones: Zone[] }>('/api/catalog/zones'),
      ]);
      return { specialties: s.specialties, zones: z.zones };
    },
    staleTime: 5 * 60_000,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['photographers', { specialty, zone, q, minCents, maxCents, sort, page }],
    queryFn: () => api.get<SearchResponse>(`/api/photographers?${params.toString()}`),
  });

  function update(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete('page'); // cualquier filtro nuevo vuelve a la primera página
    setParams(next);
  }

  function updatePrice(rangeIndex: number) {
    const range = PRICE_RANGES[rangeIndex]!;
    const next = new URLSearchParams(params);
    range.min ? next.set('minCents', range.min) : next.delete('minCents');
    range.max ? next.set('maxCents', range.max) : next.delete('maxCents');
    next.delete('page');
    setParams(next);
  }

  const activeCount = [specialty, zone, q, minCents, maxCents].filter(Boolean).length;
  const activeRange = PRICE_RANGES.findIndex((r) => r.min === minCents && r.max === maxCents);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <header className="mb-10">
        <p className="overline mb-3">Descubrimiento</p>
        <h1 className="text-3xl text-bone sm:text-4xl md:text-5xl">Encuentra tu fotógrafo</h1>
      </header>

      <div className="grid gap-8 lg:grid-cols-[260px_1fr] lg:gap-10">
        {/* ── Filtros ─────────────────────────────────────────── */}
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="overline">Filtros</h2>
            {activeCount > 0 && (
              <button onClick={() => setParams({})} className="text-xs text-lime hover:underline">
                Limpiar ({activeCount})
              </button>
            )}
          </div>

          <div className="mb-6">
            <label className="label">Buscar</label>
            <input
              type="search"
              className="field"
              defaultValue={q}
              placeholder="Nombre o descripción"
              onKeyDown={(e) => {
                if (e.key === 'Enter') update('q', (e.target as HTMLInputElement).value);
              }}
              onBlur={(e) => update('q', e.target.value)}
            />
          </div>

          <div className="mb-6">
            <label className="label">Especialidad</label>
            <select
              className="field"
              value={specialty}
              onChange={(e) => update('specialty', e.target.value)}
            >
              <option value="">Todas</option>
              {catalog?.specialties.map((s) => (
                <option key={s.id} value={s.slug}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="label">Zona</label>
            <select className="field" value={zone} onChange={(e) => update('zone', e.target.value)}>
              <option value="">Todas</option>
              {catalog?.zones.map((z) => (
                <option key={z.id} value={z.slug}>
                  {z.name} · {z.department}
                </option>
              ))}
            </select>
          </div>

          <div className="mb-6">
            <label className="label">Presupuesto</label>
            <div className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
              {PRICE_RANGES.map((r, i) => (
                <button
                  key={r.label}
                  onClick={() => updatePrice(i)}
                  className={`opt ${activeRange === i ? 'opt-active' : ''}`}
                >
                  {r.label}
                </button>
              ))}
            </div>
          </div>
        </aside>

        {/* ── Resultados ──────────────────────────────────────── */}
        <section>
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 border-b border-ink-line pb-4">
            <p className="text-sm text-bone-dim">
              {isLoading ? 'Buscando…' : `${data?.total ?? 0} fotógrafo${data?.total === 1 ? '' : 's'}`}
            </p>
            <select
              className="field w-auto py-2 text-sm"
              value={sort}
              onChange={(e) => update('sort', e.target.value)}
            >
              <option value="recientes">Más recientes</option>
              <option value="precio_asc">Precio: menor a mayor</option>
              <option value="precio_desc">Precio: mayor a menor</option>
            </select>
          </div>

          {isLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="skeleton h-64" />
              ))}
            </div>
          ) : data && data.photographers.length > 0 ? (
            <>
              <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-3">
                {data.photographers.map((p) => (
                  <PhotographerCardView key={p.id} photographer={p} />
                ))}
              </div>

              {data.pages > 1 && (
                <nav className="mt-12 flex items-center justify-center gap-2">
                  <button
                    className="btn btn-secondary"
                    disabled={page <= 1}
                    onClick={() => update('page', String(page - 1))}
                  >
                    Anterior
                  </button>
                  <span className="px-4 text-sm text-bone-dim">
                    {page} de {data.pages}
                  </span>
                  <button
                    className="btn btn-secondary"
                    disabled={page >= data.pages}
                    onClick={() => update('page', String(page + 1))}
                  >
                    Siguiente
                  </button>
                </nav>
              )}
            </>
          ) : (
            <div className="card p-16 text-center">
              <p className="text-lg text-bone">Nada por aquí</p>
              <p className="mt-2 text-sm text-bone-dim">
                Ningún fotógrafo coincide con esos filtros. Prueba ampliando la zona o el
                presupuesto.
              </p>
              <button onClick={() => setParams({})} className="btn btn-secondary mt-8">
                Limpiar filtros
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function PhotographerCardView({ photographer: p }: { photographer: PhotographerCard }) {
  const previews = p.preview.filter(Boolean) as string[];

  return (
    <Link
      to={`/fotografos/${p.slug}`}
      className="card card-interactive clack-frame-hover group flex flex-col"
    >
      <div className="grid grid-cols-3 gap-px bg-ink-line">
        {previews.length > 0 ? (
          previews.slice(0, 3).map((url, i) => (
            <div key={i} className="aspect-square overflow-hidden bg-ink">
              <img
                src={url}
                alt=""
                loading="lazy"
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>
          ))
        ) : (
          <div className="col-span-3 flex aspect-[3/1] items-center justify-center bg-ink">
            <span className="overline">Sin portafolio</span>
          </div>
        )}
      </div>

      <div className="flex flex-1 flex-col p-5">
        <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-bone transition-colors group-hover:text-lime">
          {p.fullName}
        </h3>
        {p.headline && (
          <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-bone-dim">{p.headline}</p>
        )}

        <div className="mt-3 flex flex-wrap gap-1.5">
          {p.specialties.slice(0, 2).map((s) => (
            <span key={s.slug} className="chip">
              {s.name}
            </span>
          ))}
        </div>

        <div className="mt-auto flex items-end justify-between gap-3 border-t border-ink-line pt-4">
          <span className="text-xs text-bone-mute">
            {p.zones
              .slice(0, 2)
              .map((z) => z.name)
              .join(' · ') || 'Sin zona'}
          </span>
          <span className="text-right text-sm">
            <span className="block text-[10px] uppercase tracking-wider text-bone-mute">Desde</span>
            <span className="font-semibold text-bone">{formatCOP(p.priceFromCents)}</span>
          </span>
        </div>
      </div>
    </Link>
  );
}
