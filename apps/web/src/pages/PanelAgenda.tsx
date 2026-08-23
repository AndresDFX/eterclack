import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { Calendar, CalendarLegend, TURN_LABEL, todayIso, type Slot } from '@/components/Calendar';
import { PanelNav } from '@/components/PanelNav';
import { formatDate } from '@/components/StatusBadge';

const TURNS = ['DIA_COMPLETO', 'MANANA', 'TARDE'] as const;

export function PanelAgendaPage() {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [turn, setTurn] = useState<(typeof TURNS)[number]>('DIA_COMPLETO');
  const [error, setError] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['my-slots'],
    queryFn: () => api.get<{ slots: Slot[] }>('/api/photographers/me/slots'),
  });

  function done() {
    setSelected(new Set());
    setError(null);
    qc.invalidateQueries({ queryKey: ['my-slots'] });
  }

  const publish = useMutation({
    mutationFn: (vars: { dates: string[]; turn: string }) =>
      api.post('/api/photographers/me/slots', vars),
    onSuccess: done,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'No pudimos publicar la agenda.'),
  });

  const withdraw = useMutation({
    mutationFn: (slotIds: string[]) => api.del('/api/photographers/me/slots', { slotIds }),
    onSuccess: done,
    onError: (e) => setError(e instanceof ApiError ? e.message : 'No pudimos retirar las franjas.'),
  });

  const slots = data?.slots ?? [];
  const free = slots.filter((s) => s.status === 'DISPONIBLE');
  const booked = slots.filter((s) => s.status !== 'DISPONIBLE');

  // Franjas libres que caen en los días seleccionados: retirables de una vez.
  const withdrawable = free.filter((s) => selected.has(s.date));

  return (
    <div className="mx-auto max-w-4xl px-4 py-12 md:px-8">
      <header className="mb-8">
        <p className="overline mb-3">Panel del fotógrafo</p>
        <h1 className="text-3xl text-bone sm:text-4xl">Mi calendario</h1>
        <p className="mt-3 max-w-2xl text-bone-dim">
          Publica los días en los que puedes trabajar. Los clientes solo pueden reservar sobre lo que
          aparezca aquí: <strong className="text-bone">sin franja publicada no hay cita posible</strong>.
        </p>
      </header>

      <PanelNav active="agenda" />

      {error && (
        <div role="alert" className="mb-6 border-l-2 border-danger bg-danger/10 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_280px]">
        <div className="card p-5">
          {isLoading ? (
            <div className="skeleton h-80" />
          ) : (
            <>
              <Calendar
                slots={slots}
                selectable="cualquier-dia-futuro"
                multi={selected}
                onToggleMulti={(d) => {
                  if (d < todayIso()) return;
                  setSelected((prev) => {
                    const next = new Set(prev);
                    next.has(d) ? next.delete(d) : next.add(d);
                    return next;
                  });
                }}
              />
              <CalendarLegend
                items={[
                  { className: 'border-bone-mute/50', label: `Publicado (${free.length})` },
                  { className: 'border-success bg-success/10', label: `Con cita (${booked.length})` },
                  { className: 'border-lime bg-lime', label: 'Seleccionado' },
                ]}
              />
            </>
          )}
        </div>

        <aside className="space-y-6">
          <div className="card p-5">
            <p className="overline mb-4">Jornada a publicar</p>
            <div className="flex flex-col gap-2">
              {TURNS.map((t) => (
                <button
                  key={t}
                  onClick={() => setTurn(t)}
                  className={`opt ${turn === t ? 'opt-active bg-lime/10' : 'text-bone'}`}
                >
                  {TURN_LABEL[t]}
                </button>
              ))}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-bone-mute">
              Una jornada completa ocupa el día entero. Mañana y tarde pueden convivir en el mismo
              día como dos cupos distintos.
            </p>
          </div>

          {booked.length > 0 && (
            <div className="card p-5">
              <p className="overline mb-4">Próximas citas</p>
              <ul className="space-y-3">
                {booked.slice(0, 5).map((s) => (
                  <li key={s.id} className="border-l-2 border-success pl-3">
                    <p className="text-sm text-bone">{formatDate(`${s.date}T00:00:00Z`)}</p>
                    <p className="text-xs text-bone-mute">
                      {TURN_LABEL[s.turn]}
                      {s.order && ` · ${s.order.client.fullName}`}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </aside>
      </div>

      {selected.size > 0 && (
        <div className="sticky bottom-0 mt-6 border border-lime bg-ink-soft p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-bone">
              <strong className="text-lime">{selected.size}</strong> día
              {selected.size === 1 ? '' : 's'} · {TURN_LABEL[turn]}
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                onClick={() => publish.mutate({ dates: [...selected], turn })}
                className="btn btn-primary"
                disabled={publish.isPending}
              >
                {publish.isPending ? 'Publicando…' : 'Publicar disponibilidad'}
              </button>
              {withdrawable.length > 0 && (
                <button
                  onClick={() => withdraw.mutate(withdrawable.map((s) => s.id))}
                  className="btn btn-danger"
                  disabled={withdraw.isPending}
                >
                  Retirar {withdrawable.length}
                </button>
              )}
              <button onClick={() => setSelected(new Set())} className="btn btn-secondary">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
