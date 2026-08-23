import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, formatCOP, type Specialty, type Zone, type Package } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { FormError, FormSuccess } from '@/components/AuthShell';
import { PanelNav } from '@/components/PanelNav';

type Profile = {
  id: string;
  slug: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED' | 'SUSPENDED';
  headline: string | null;
  bio: string | null;
  priceFromCents: string | null;
  instagram: string | null;
  website: string | null;
  rejectionReason: string | null;
  bankVerifiedAt: string | null;
  specialtyIds: string[];
  zoneIds: string[];
  packages: Package[];
};

const STATUS_COPY = {
  PENDING: {
    label: 'En revisión',
    tone: 'warn',
    detail: 'Tu perfil no aparece en las búsquedas hasta que administración lo apruebe.',
  },
  APPROVED: {
    label: 'Publicado',
    tone: 'success',
    detail: 'Tu perfil aparece en las búsquedas y puede recibir solicitudes.',
  },
  REJECTED: {
    label: 'Requiere ajustes',
    tone: 'danger',
    detail: 'Corrige lo indicado y vuelve a postularte.',
  },
  SUSPENDED: {
    label: 'Suspendido',
    tone: 'danger',
    detail: 'Escríbenos a hola@eterclack.com para revisar tu caso.',
  },
} as const;

export function PhotographerPanelPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['my-profile'],
    queryFn: () => api.get<{ profile: Profile }>('/api/photographers/me/profile'),
  });

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

  const [form, setForm] = useState({
    headline: '',
    bio: '',
    priceFrom: '',
    instagram: '',
    website: '',
    specialtyIds: [] as string[],
    zoneIds: [] as string[],
  });

  // Rellena el formulario cuando llega el perfil.
  useEffect(() => {
    if (!data?.profile) return;
    const p = data.profile;
    setForm({
      headline: p.headline ?? '',
      bio: p.bio ?? '',
      priceFrom: p.priceFromCents ? String(BigInt(p.priceFromCents) / 100n) : '',
      instagram: p.instagram ?? '',
      website: p.website ?? '',
      specialtyIds: p.specialtyIds,
      zoneIds: p.zoneIds,
    });
  }, [data]);

  const save = useMutation({
    mutationFn: (payload: Record<string, unknown>) =>
      api.patch('/api/photographers/me/profile', payload),
    onSuccess: () => {
      setSaved(true);
      setError(null);
      qc.invalidateQueries({ queryKey: ['my-profile'] });
      setTimeout(() => setSaved(false), 3000);
    },
    onError: (err) =>
      setError(err instanceof ApiError ? err.message : 'No pudimos guardar los cambios.'),
  });

  const reapply = useMutation({
    mutationFn: () => api.post('/api/photographers/me/reapply'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['my-profile'] }),
  });

  function toggle(field: 'specialtyIds' | 'zoneIds', id: string) {
    setForm((f) => ({
      ...f,
      [field]: f[field].includes(id) ? f[field].filter((x) => x !== id) : [...f[field], id],
    }));
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    save.mutate({
      headline: form.headline || undefined,
      bio: form.bio || undefined,
      // El usuario escribe pesos; el servidor guarda centavos enteros.
      priceFromCents: form.priceFrom ? String(BigInt(form.priceFrom) * 100n) : undefined,
      instagram: form.instagram || undefined,
      website: form.website || undefined,
      specialtyIds: form.specialtyIds,
      zoneIds: form.zoneIds,
    });
  }

  if (isLoading || !data) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-12 md:px-8">
        <div className="skeleton h-12 w-72" />
      </div>
    );
  }

  const profile = data.profile;
  const status = STATUS_COPY[profile.status];

  return (
    <div className="mx-auto max-w-5xl px-4 py-12 md:px-8">
      <header className="mb-10">
        <p className="overline mb-3">Panel del fotógrafo</p>
        <h1 className="text-4xl text-bone">Hola, {user?.fullName.split(' ')[0]}</h1>
      </header>

      <PanelNav active="perfil" />

      {/* ── Estado del perfil ─────────────────────────────────── */}
      <section
        className={`card mb-10 border-l-2 p-6 ${
          status.tone === 'success'
            ? 'border-l-success'
            : status.tone === 'warn'
              ? 'border-l-warn'
              : 'border-l-danger'
        }`}
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="overline mb-2">Estado del perfil</p>
            <p className="font-[family-name:var(--font-display)] text-xl font-semibold text-bone">
              {status.label}
            </p>
            <p className="mt-2 max-w-xl text-sm text-bone-dim">{status.detail}</p>

            {profile.status === 'REJECTED' && profile.rejectionReason && (
              <p className="mt-4 border-l-2 border-lime pl-4 text-sm text-bone">
                {profile.rejectionReason}
              </p>
            )}
          </div>

          {profile.status === 'APPROVED' && (
            <a
              href={`/fotografos/${profile.slug}`}
              className="btn btn-secondary"
              target="_blank"
              rel="noreferrer"
            >
              Ver perfil público
            </a>
          )}
          {profile.status === 'REJECTED' && (
            <button
              onClick={() => reapply.mutate()}
              className="btn btn-primary"
              disabled={reapply.isPending}
            >
              {reapply.isPending ? 'Enviando…' : 'Volver a postularme'}
            </button>
          )}
        </div>
      </section>

      {/* ── Formulario ────────────────────────────────────────── */}
      <form onSubmit={handleSubmit}>
        <FormError message={error} />
        <FormSuccess message={saved ? 'Cambios guardados.' : null} />

        <section className="card mb-6 p-6">
          <h2 className="mb-6 text-xl text-bone">Tu presentación</h2>

          <div className="mb-5">
            <label className="label">Titular</label>
            <input
              type="text"
              className="field"
              maxLength={120}
              value={form.headline}
              onChange={(e) => setForm({ ...form, headline: e.target.value })}
              placeholder="Bodas con luz natural en el Valle"
            />
            <p className="mt-1.5 text-xs text-bone-mute">
              Una línea que resuma qué haces y dónde. Es lo primero que ve un cliente.
            </p>
          </div>

          <div className="mb-5">
            <label className="label">Biografía</label>
            <textarea
              className="field min-h-32 resize-y"
              maxLength={2000}
              value={form.bio}
              onChange={(e) => setForm({ ...form, bio: e.target.value })}
              placeholder="Tu experiencia, tu estilo y qué puede esperar un cliente al contratarte."
            />
            <p className="mt-1.5 text-xs text-bone-mute">{form.bio.length}/2000</p>
          </div>

          <div className="grid gap-5 sm:grid-cols-3">
            <div>
              <label className="label">Precio desde (COP)</label>
              <input
                type="number"
                className="field"
                min={0}
                step={1000}
                value={form.priceFrom}
                onChange={(e) => setForm({ ...form, priceFrom: e.target.value })}
                placeholder="1800000"
              />
              {form.priceFrom && (
                <p className="mt-1.5 text-xs text-lime">
                  {formatCOP(BigInt(form.priceFrom || '0') * 100n)}
                </p>
              )}
            </div>
            <div>
              <label className="label">Instagram</label>
              <input
                type="text"
                className="field"
                value={form.instagram}
                onChange={(e) => setForm({ ...form, instagram: e.target.value })}
                placeholder="@tucuenta"
              />
            </div>
            <div>
              <label className="label">Sitio web</label>
              <input
                type="url"
                className="field"
                value={form.website}
                onChange={(e) => setForm({ ...form, website: e.target.value })}
                placeholder="https://…"
              />
            </div>
          </div>
        </section>

        <section className="card mb-6 p-6">
          <h2 className="mb-2 text-xl text-bone">Especialidades</h2>
          <p className="mb-5 text-sm text-bone-dim">Máximo 8. Determinan en qué búsquedas apareces.</p>
          <div className="flex flex-wrap gap-2">
            {catalog?.specialties.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => toggle('specialtyIds', s.id)}
                className={`chip ${form.specialtyIds.includes(s.id) ? 'chip-active' : ''}`}
              >
                {s.name}
              </button>
            ))}
          </div>
        </section>

        <section className="card mb-6 p-6">
          <h2 className="mb-2 text-xl text-bone">Zonas donde trabajas</h2>
          <p className="mb-5 text-sm text-bone-dim">Máximo 12.</p>
          <div className="flex flex-wrap gap-2">
            {catalog?.zones.map((z) => (
              <button
                key={z.id}
                type="button"
                onClick={() => toggle('zoneIds', z.id)}
                className={`chip ${form.zoneIds.includes(z.id) ? 'chip-active' : ''}`}
              >
                {z.name}
              </button>
            ))}
          </div>
        </section>

        <div className="sticky bottom-0 -mx-4 border-t border-ink-line bg-ink/95 px-4 py-4 backdrop-blur md:mx-0 md:px-0">
          <button type="submit" className="btn btn-primary" disabled={save.isPending}>
            {save.isPending ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </form>

      {/* ── Paquetes y pendientes ─────────────────────────────── */}
      <section className="card mt-10 p-6">
        <h2 className="mb-6 text-xl text-bone">Tus paquetes</h2>
        {profile.packages.length > 0 ? (
          <div className="grid gap-4 md:grid-cols-3">
            {profile.packages.map((pkg) => (
              <div key={pkg.id} className="border border-ink-line p-4">
                <p className="font-[family-name:var(--font-display)] font-semibold text-bone">
                  {pkg.name}
                </p>
                <p className="mt-1 text-lg font-bold text-lime">{formatCOP(pkg.priceCents)}</p>
                <p className="mt-2 text-xs text-bone-mute">
                  {pkg.maxSelectablePhotos} fotos · {pkg.deliveryDays} días
                </p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-bone-dim">Aún no tienes paquetes configurados.</p>
        )}
      </section>

    </div>
  );
}
