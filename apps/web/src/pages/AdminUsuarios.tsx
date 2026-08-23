import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError, type Role } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { AdminNav } from '@/components/AdminNav';
import { formatDateTime } from '@/components/StatusBadge';

type UserStatus = 'ACTIVE' | 'SUSPENDED' | 'DELETED';

type Usuario = {
  id: string;
  email: string;
  fullName: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  emailVerifiedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
  photographer: { id: string; slug: string; status: string } | null;
  _count: { clientOrders: number; sessions: number };
};

type Respuesta = {
  total: number;
  page: number;
  pages: number;
  users: Usuario[];
  resumen: Partial<Record<Role, number>>;
};

const ROL_LABEL: Record<Role, string> = {
  CLIENT: 'Cliente',
  PHOTOGRAPHER: 'Fotógrafo',
  ADMIN: 'Administración',
};

const ESTADO_LABEL: Record<UserStatus, { texto: string; clase: string }> = {
  ACTIVE: { texto: 'Activo', clase: 'border-success text-success' },
  SUSPENDED: { texto: 'Suspendido', clase: 'border-warn text-warn' },
  DELETED: { texto: 'Borrado', clase: 'border-danger text-danger' },
};

const VACIO = {
  email: '',
  fullName: '',
  phone: '',
  role: 'CLIENT' as Role,
  password: '',
  emailVerified: true,
  notify: false,
};

export function AdminUsuariosPage() {
  const qc = useQueryClient();
  const { user: yo } = useAuth();

  const [rol, setRol] = useState<Role | ''>('');
  const [estado, setEstado] = useState<UserStatus | ''>('');
  const [busqueda, setBusqueda] = useState('');
  const [incluirBorrados, setIncluirBorrados] = useState(false);
  const [pagina, setPagina] = useState(1);

  const [creando, setCreando] = useState(false);
  const [form, setForm] = useState(VACIO);
  const [editando, setEditando] = useState<Usuario | null>(null);
  const [claveDe, setClaveDe] = useState<Usuario | null>(null);
  const [claveNueva, setClaveNueva] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [issues, setIssues] = useState<ApiError | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const params = new URLSearchParams();
  if (rol) params.set('role', rol);
  if (estado) params.set('status', estado);
  if (busqueda) params.set('q', busqueda);
  if (incluirBorrados) params.set('incluirBorrados', 'true');
  params.set('page', String(pagina));

  const { data, isLoading } = useQuery({
    queryKey: ['admin-users', rol, estado, busqueda, incluirBorrados, pagina],
    queryFn: () => api.get<Respuesta>(`/api/admin/users?${params.toString()}`),
  });

  function refrescar(mensaje?: string) {
    qc.invalidateQueries({ queryKey: ['admin-users'] });
    qc.invalidateQueries({ queryKey: ['admin-dashboard'] });
    setError(null);
    setIssues(null);
    if (mensaje) {
      setAviso(mensaje);
      setTimeout(() => setAviso(null), 4000);
    }
  }

  function fallo(e: unknown, porDefecto: string) {
    if (e instanceof ApiError) {
      setError(e.message || porDefecto);
      setIssues(e);
    } else {
      setError(porDefecto);
    }
  }

  const crear = useMutation({
    mutationFn: () =>
      api.post('/api/admin/users', {
        ...form,
        phone: form.phone || undefined,
      }),
    onSuccess: () => {
      setCreando(false);
      setForm(VACIO);
      refrescar('Usuario creado.');
    },
    onError: (e) => fallo(e, 'No pudimos crear el usuario.'),
  });

  const actualizar = useMutation({
    mutationFn: (vars: { id: string; cambios: Record<string, unknown> }) =>
      api.patch(`/api/admin/users/${vars.id}`, vars.cambios),
    onSuccess: () => {
      setEditando(null);
      refrescar('Cambios guardados.');
    },
    onError: (e) => fallo(e, 'No pudimos guardar los cambios.'),
  });

  const borrar = useMutation({
    mutationFn: (id: string) => api.del(`/api/admin/users/${id}`),
    onSuccess: () => refrescar('Usuario borrado.'),
    onError: (e) => fallo(e, 'No pudimos borrar el usuario.'),
  });

  const restaurar = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/users/${id}/restore`),
    onSuccess: () => refrescar('Usuario restaurado.'),
    onError: (e) => fallo(e, 'No pudimos restaurar el usuario.'),
  });

  const cambiarClave = useMutation({
    mutationFn: (vars: { id: string; password: string }) =>
      api.post(`/api/admin/users/${vars.id}/password`, { password: vars.password }),
    onSuccess: () => {
      setClaveDe(null);
      setClaveNueva('');
      refrescar('Contraseña cambiada. Se cerraron sus sesiones.');
    },
    onError: (e) => fallo(e, 'No pudimos cambiar la contraseña.'),
  });

  const enviarEnlace = useMutation({
    mutationFn: (id: string) => api.post(`/api/admin/users/${id}/send-reset`),
    onSuccess: () => refrescar('Enlace de recuperación enviado.'),
    onError: (e) => fallo(e, 'No pudimos enviar el enlace.'),
  });

  const usuarios = data?.users ?? [];
  const filtrosActivos = [rol, estado, busqueda].filter(Boolean).length + (incluirBorrados ? 1 : 0);

  return (
    <div className="mx-auto max-w-7xl px-4 py-12 md:px-8">
      <header className="mb-8">
        <p className="overline mb-3">Administración</p>
        <h1 className="text-3xl text-bone sm:text-4xl">Usuarios</h1>
        <p className="mt-3 max-w-2xl text-bone-dim">
          Crea, edita y da de baja cuentas de cualquier tipo, incluida administración.
        </p>
      </header>

      <AdminNav active="usuarios" />

      {/* ── Resumen ────────────────────────────────────────── */}
      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metrica etiqueta="Total activos" valor={
          (data?.resumen.CLIENT ?? 0) + (data?.resumen.PHOTOGRAPHER ?? 0) + (data?.resumen.ADMIN ?? 0)
        } />
        <Metrica etiqueta="Clientes" valor={data?.resumen.CLIENT} />
        <Metrica etiqueta="Fotógrafos" valor={data?.resumen.PHOTOGRAPHER} />
        <Metrica etiqueta="Administración" valor={data?.resumen.ADMIN} tono="lime" />
      </div>

      {aviso && (
        <div role="status" className="mb-5 border-l-2 border-success bg-success/10 px-4 py-3 text-sm">
          {aviso}
        </div>
      )}
      {error && !creando && !editando && !claveDe && (
        <div role="alert" className="mb-5 border-l-2 border-danger bg-danger/10 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* ── Filtros ────────────────────────────────────────── */}
      <div className="card mb-6 p-5">
        <div className="grid gap-4 md:grid-cols-[1fr_auto_auto_auto]">
          <div>
            <label className="label">Buscar</label>
            <input
              type="search"
              className="field"
              defaultValue={busqueda}
              placeholder="Nombre o correo"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setBusqueda((e.target as HTMLInputElement).value);
                  setPagina(1);
                }
              }}
              onBlur={(e) => {
                setBusqueda(e.target.value);
                setPagina(1);
              }}
            />
          </div>
          <div>
            <label className="label">Rol</label>
            <select
              className="field"
              value={rol}
              onChange={(e) => {
                setRol(e.target.value as Role | '');
                setPagina(1);
              }}
            >
              <option value="">Todos</option>
              <option value="CLIENT">Cliente</option>
              <option value="PHOTOGRAPHER">Fotógrafo</option>
              <option value="ADMIN">Administración</option>
            </select>
          </div>
          <div>
            <label className="label">Estado</label>
            <select
              className="field"
              value={estado}
              onChange={(e) => {
                setEstado(e.target.value as UserStatus | '');
                setPagina(1);
              }}
            >
              <option value="">Todos</option>
              <option value="ACTIVE">Activo</option>
              <option value="SUSPENDED">Suspendido</option>
              <option value="DELETED">Borrado</option>
            </select>
          </div>
          <div className="flex items-end">
            <button
              onClick={() => {
                setCreando(true);
                setForm(VACIO);
                setError(null);
              }}
              className="btn btn-primary w-full"
            >
              Crear usuario
            </button>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-4 border-t border-ink-line pt-4">
          <label className="check-row text-sm text-bone-dim">
            <input
              type="checkbox"
              className="checkbox"
              checked={incluirBorrados}
              onChange={(e) => {
                setIncluirBorrados(e.target.checked);
                setPagina(1);
              }}
            />
            <span>Incluir borrados</span>
          </label>
          {filtrosActivos > 0 && (
            <button
              onClick={() => {
                setRol('');
                setEstado('');
                setBusqueda('');
                setIncluirBorrados(false);
                setPagina(1);
              }}
              className="link-nav text-xs text-lime hover:underline"
            >
              Limpiar filtros ({filtrosActivos})
            </button>
          )}
          <span className="ml-auto text-sm text-bone-dim">
            {isLoading ? 'Buscando…' : `${data?.total ?? 0} usuario${data?.total === 1 ? '' : 's'}`}
          </span>
        </div>
      </div>

      {/* ── Crear ──────────────────────────────────────────── */}
      {creando && (
        <FormularioUsuario
          titulo="Crear usuario"
          form={form}
          setForm={setForm}
          error={error}
          issues={issues}
          ocupado={crear.isPending}
          onCancelar={() => {
            setCreando(false);
            setError(null);
          }}
          onGuardar={(e) => {
            e.preventDefault();
            crear.mutate();
          }}
        />
      )}

      {/* ── Editar ─────────────────────────────────────────── */}
      {editando && (
        <FormularioEdicion
          usuario={editando}
          esYo={editando.id === yo?.id}
          error={error}
          issues={issues}
          ocupado={actualizar.isPending}
          onCancelar={() => {
            setEditando(null);
            setError(null);
          }}
          onGuardar={(cambios) => actualizar.mutate({ id: editando.id, cambios })}
        />
      )}

      {/* ── Contraseña ─────────────────────────────────────── */}
      {claveDe && (
        <section className="clack-frame mb-6 bg-ink-soft p-6">
          <h2 className="mb-1 text-xl text-bone">Nueva contraseña</h2>
          <p className="mb-5 text-sm text-bone-dim">
            Para <strong className="text-bone">{claveDe.fullName}</strong> ({claveDe.email}).
            Se cerrarán todas sus sesiones abiertas.
          </p>
          {error && (
            <div role="alert" className="mb-4 border-l-2 border-danger bg-danger/10 px-4 py-3 text-sm">
              {error}
            </div>
          )}
          <div className="flex flex-wrap items-end gap-3">
            <div className="min-w-64 flex-1">
              <label className="label">Contraseña</label>
              <input
                type="text"
                className="field"
                value={claveNueva}
                onChange={(e) => setClaveNueva(e.target.value)}
                placeholder="Mínimo 8 caracteres"
                autoFocus
              />
            </div>
            <button
              onClick={() => cambiarClave.mutate({ id: claveDe.id, password: claveNueva })}
              className="btn btn-primary"
              disabled={claveNueva.length < 8 || cambiarClave.isPending}
            >
              {cambiarClave.isPending ? 'Guardando…' : 'Cambiar'}
            </button>
            <button
              onClick={() => {
                setClaveDe(null);
                setClaveNueva('');
                setError(null);
              }}
              className="btn btn-secondary"
            >
              Cancelar
            </button>
          </div>
          <p className="mt-3 text-xs text-bone-mute">
            La contraseña se muestra en claro a propósito: hay que poder copiarla para dársela a
            esa persona.
          </p>
        </section>
      )}

      {/* ── Listado ────────────────────────────────────────── */}
      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="skeleton h-20" />
          ))}
        </div>
      ) : usuarios.length === 0 ? (
        <div className="card p-16 text-center">
          <p className="text-bone">Ningún usuario coincide con esos filtros.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {usuarios.map((u) => (
            <article key={u.id} className={`card p-5 ${u.deletedAt ? 'opacity-60' : ''}`}>
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="font-[family-name:var(--font-display)] text-lg font-semibold text-bone">
                      {u.fullName}
                    </h3>
                    <span className="chip">{ROL_LABEL[u.role]}</span>
                    <span className={`chip ${ESTADO_LABEL[u.status].clase}`}>
                      {ESTADO_LABEL[u.status].texto}
                    </span>
                    {!u.emailVerifiedAt && (
                      <span className="chip border-warn text-warn">Sin verificar</span>
                    )}
                    {u.id === yo?.id && <span className="chip chip-active">Tú</span>}
                  </div>

                  <p className="mt-1 text-sm text-bone-mute">
                    {u.email}
                    {u.phone && ` · ${u.phone}`}
                  </p>

                  <dl className="mt-3 flex flex-wrap gap-x-6 gap-y-1 text-xs">
                    <Dato etiqueta="Creado" valor={formatDateTime(u.createdAt)} />
                    {u.role === 'CLIENT' && (
                      <Dato etiqueta="Reservas" valor={String(u._count.clientOrders)} />
                    )}
                    {u.photographer && (
                      <Dato etiqueta="Perfil" valor={`${u.photographer.slug} · ${u.photographer.status}`} />
                    )}
                  </dl>
                </div>

                <div className="flex flex-wrap gap-2">
                  {u.deletedAt ? (
                    <button
                      onClick={() => restaurar.mutate(u.id)}
                      className="btn btn-primary"
                      disabled={restaurar.isPending}
                    >
                      Restaurar
                    </button>
                  ) : (
                    <>
                      <button
                        onClick={() => {
                          setEditando(u);
                          setError(null);
                        }}
                        className="btn btn-secondary"
                      >
                        Editar
                      </button>
                      <button
                        onClick={() => {
                          setClaveDe(u);
                          setClaveNueva('');
                          setError(null);
                        }}
                        className="btn btn-secondary"
                      >
                        Contraseña
                      </button>
                      {u.status === 'ACTIVE' ? (
                        <button
                          onClick={() =>
                            actualizar.mutate({ id: u.id, cambios: { status: 'SUSPENDED' } })
                          }
                          className="btn btn-secondary"
                          disabled={u.id === yo?.id}
                          title={u.id === yo?.id ? 'No puedes suspenderte a ti mismo' : undefined}
                        >
                          Suspender
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            actualizar.mutate({ id: u.id, cambios: { status: 'ACTIVE' } })
                          }
                          className="btn btn-secondary"
                        >
                          Activar
                        </button>
                      )}
                      <button
                        onClick={() => borrar.mutate(u.id)}
                        className="btn btn-danger"
                        disabled={u.id === yo?.id || borrar.isPending}
                        title={u.id === yo?.id ? 'No puedes borrar tu propia cuenta' : undefined}
                      >
                        Borrar
                      </button>
                    </>
                  )}
                </div>
              </div>

              {u.status === 'ACTIVE' && !u.emailVerifiedAt && (
                <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-ink-line pt-4">
                  <span className="text-xs text-bone-mute">
                    No ha confirmado su correo: no puede reservar.
                  </span>
                  <button
                    onClick={() => actualizar.mutate({ id: u.id, cambios: { emailVerified: true } })}
                    className="link-nav text-xs text-lime hover:underline"
                  >
                    Marcar como verificado
                  </button>
                  <button
                    onClick={() => enviarEnlace.mutate(u.id)}
                    className="link-nav text-xs text-bone-dim hover:text-lime"
                  >
                    Enviarle un enlace
                  </button>
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {data && data.pages > 1 && (
        <nav className="mt-10 flex items-center justify-center gap-2">
          <button
            className="btn btn-secondary"
            disabled={pagina <= 1}
            onClick={() => setPagina((p) => p - 1)}
          >
            Anterior
          </button>
          <span className="px-4 text-sm text-bone-dim">
            {pagina} de {data.pages}
          </span>
          <button
            className="btn btn-secondary"
            disabled={pagina >= data.pages}
            onClick={() => setPagina((p) => p + 1)}
          >
            Siguiente
          </button>
        </nav>
      )}
    </div>
  );
}

// ─── Formulario de creación ──────────────────────────────────────
function FormularioUsuario({
  titulo,
  form,
  setForm,
  error,
  issues,
  ocupado,
  onCancelar,
  onGuardar,
}: {
  titulo: string;
  form: typeof VACIO;
  setForm: (f: typeof VACIO) => void;
  error: string | null;
  issues: ApiError | null;
  ocupado: boolean;
  onCancelar: () => void;
  onGuardar: (e: FormEvent) => void;
}) {
  return (
    <form onSubmit={onGuardar} className="clack-frame mb-6 bg-ink-soft p-6">
      <h2 className="mb-5 text-xl text-bone">{titulo}</h2>

      {error && (
        <div role="alert" className="mb-5 border-l-2 border-danger bg-danger/10 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <fieldset className="mb-5">
        <legend className="label">Tipo de usuario</legend>
        <div className="grid gap-2 sm:grid-cols-3">
          {(['CLIENT', 'PHOTOGRAPHER', 'ADMIN'] as Role[]).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => setForm({ ...form, role: r })}
              aria-pressed={form.role === r}
              className={`border p-3 text-left transition-colors ${
                form.role === r ? 'border-lime bg-lime/10' : 'border-ink-line hover:border-bone-mute'
              }`}
            >
              <span
                className={`block font-[family-name:var(--font-display)] text-sm font-semibold ${
                  form.role === r ? 'text-lime' : 'text-bone'
                }`}
              >
                {ROL_LABEL[r]}
              </span>
              <span className="mt-0.5 block text-xs text-bone-mute">
                {r === 'CLIENT'
                  ? 'Reserva sesiones'
                  : r === 'PHOTOGRAPHER'
                    ? 'Publica agenda y cobra'
                    : 'Control total'}
              </span>
            </button>
          ))}
        </div>
        {form.role === 'PHOTOGRAPHER' && (
          <p className="mt-2 text-xs text-bone-mute">
            Se le crea el perfil en estado pendiente. No aparece en las búsquedas hasta aprobarlo.
          </p>
        )}
        {form.role === 'ADMIN' && (
          <p className="mt-2 text-xs text-warn">
            Tendrá control total: aprobar fotógrafos, ver todas las órdenes y gestionar usuarios.
          </p>
        )}
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Nombre completo" error={issues?.fieldError('fullName')}>
          <input
            type="text"
            className="field"
            value={form.fullName}
            onChange={(e) => setForm({ ...form, fullName: e.target.value })}
            required
            minLength={3}
          />
        </Campo>
        <Campo label="Correo" error={issues?.fieldError('email')}>
          <input
            type="email"
            className="field"
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
            required
          />
        </Campo>
        <Campo label="Teléfono (opcional)">
          <input
            type="tel"
            className="field"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
            placeholder="+57 300 000 0000"
          />
        </Campo>
        <Campo
          label="Contraseña"
          error={issues?.fieldError('password')}
          pista="Mínimo 8 caracteres. Compártela con esa persona."
        >
          <input
            type="text"
            className="field"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            required
            minLength={8}
          />
        </Campo>
      </div>

      <div className="mb-5 mt-1 flex flex-wrap gap-6">
        <label className="check-row text-sm text-bone-dim">
          <input
            type="checkbox"
            className="checkbox"
            checked={form.emailVerified}
            onChange={(e) => setForm({ ...form, emailVerified: e.target.checked })}
          />
          <span>
            Marcar el correo como verificado
            <span className="mt-0.5 block text-xs text-bone-mute">
              Sin esto no podrá reservar hasta confirmarlo.
            </span>
          </span>
        </label>
        <label className="check-row text-sm text-bone-dim">
          <input
            type="checkbox"
            className="checkbox"
            checked={form.notify}
            onChange={(e) => setForm({ ...form, notify: e.target.checked })}
          />
          <span>
            Avisarle por correo
            <span className="mt-0.5 block text-xs text-bone-mute">
              Requiere correo configurado.
            </span>
          </span>
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={ocupado}>
          {ocupado ? 'Creando…' : 'Crear usuario'}
        </button>
        <button type="button" onClick={onCancelar} className="btn btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─── Formulario de edición ───────────────────────────────────────
function FormularioEdicion({
  usuario,
  esYo,
  error,
  issues,
  ocupado,
  onCancelar,
  onGuardar,
}: {
  usuario: Usuario;
  esYo: boolean;
  error: string | null;
  issues: ApiError | null;
  ocupado: boolean;
  onCancelar: () => void;
  onGuardar: (cambios: Record<string, unknown>) => void;
}) {
  const [datos, setDatos] = useState({
    fullName: usuario.fullName,
    email: usuario.email,
    phone: usuario.phone ?? '',
    role: usuario.role,
    emailVerified: usuario.emailVerifiedAt !== null,
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onGuardar({
          fullName: datos.fullName,
          email: datos.email,
          phone: datos.phone || null,
          role: datos.role,
          emailVerified: datos.emailVerified,
        });
      }}
      className="clack-frame mb-6 bg-ink-soft p-6"
    >
      <h2 className="mb-1 text-xl text-bone">Editar usuario</h2>
      <p className="mb-5 text-sm text-bone-mute">{usuario.email}</p>

      {error && (
        <div role="alert" className="mb-5 border-l-2 border-danger bg-danger/10 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Nombre completo" error={issues?.fieldError('fullName')}>
          <input
            type="text"
            className="field"
            value={datos.fullName}
            onChange={(e) => setDatos({ ...datos, fullName: e.target.value })}
            required
          />
        </Campo>
        <Campo label="Correo" error={issues?.fieldError('email')}>
          <input
            type="email"
            className="field"
            value={datos.email}
            onChange={(e) => setDatos({ ...datos, email: e.target.value })}
            required
          />
        </Campo>
        <Campo label="Teléfono">
          <input
            type="tel"
            className="field"
            value={datos.phone}
            onChange={(e) => setDatos({ ...datos, phone: e.target.value })}
          />
        </Campo>
        <Campo
          label="Rol"
          pista={esYo ? 'No puedes cambiar tu propio rol.' : undefined}
        >
          <select
            className="field"
            value={datos.role}
            onChange={(e) => setDatos({ ...datos, role: e.target.value as Role })}
            disabled={esYo}
          >
            <option value="CLIENT">Cliente</option>
            <option value="PHOTOGRAPHER">Fotógrafo</option>
            <option value="ADMIN">Administración</option>
          </select>
        </Campo>
      </div>

      <label className="check-row mb-5 text-sm text-bone-dim">
        <input
          type="checkbox"
          className="checkbox"
          checked={datos.emailVerified}
          onChange={(e) => setDatos({ ...datos, emailVerified: e.target.checked })}
        />
        <span>Correo verificado</span>
      </label>

      <div className="flex flex-wrap gap-2">
        <button type="submit" className="btn btn-primary" disabled={ocupado}>
          {ocupado ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button type="button" onClick={onCancelar} className="btn btn-secondary">
          Cancelar
        </button>
      </div>
    </form>
  );
}

// ─── Piezas ──────────────────────────────────────────────────────
function Campo({
  label,
  error,
  pista,
  children,
}: {
  label: string;
  error?: string;
  pista?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mb-1">
      <label className="label">{label}</label>
      {children}
      {error && <p className="mt-1.5 text-xs text-danger">{error}</p>}
      {!error && pista && <p className="mt-1.5 text-xs text-bone-mute">{pista}</p>}
    </div>
  );
}

function Metrica({
  etiqueta,
  valor,
  tono,
}: {
  etiqueta: string;
  valor?: number;
  tono?: 'lime';
}) {
  return (
    <div className="card p-5">
      <p className="overline mb-2">{etiqueta}</p>
      {valor === undefined ? (
        <div className="skeleton h-8 w-12" />
      ) : (
        <p
          className={`font-[family-name:var(--font-display)] text-3xl font-bold ${
            tono === 'lime' ? 'text-lime' : 'text-bone'
          }`}
        >
          {valor}
        </p>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor }: { etiqueta: string; valor: string }) {
  return (
    <div>
      <dt className="text-bone-mute">{etiqueta}</dt>
      <dd className="mt-0.5 text-bone-dim">{valor}</dd>
    </div>
  );
}
