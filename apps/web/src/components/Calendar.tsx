import { useMemo, useState } from 'react';

export type Slot = {
  id: string;
  date: string; // YYYY-MM-DD
  turn: 'MANANA' | 'TARDE' | 'DIA_COMPLETO';
  status?: 'DISPONIBLE' | 'RETENIDA' | 'RESERVADA';
  note?: string | null;
  order?: { id: string; code: string; status: string; client: { fullName: string } } | null;
};

export const TURN_LABEL: Record<Slot['turn'], string> = {
  MANANA: 'Mañana',
  TARDE: 'Tarde',
  DIA_COMPLETO: 'Jornada completa',
};

const MONTHS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];
const WEEKDAYS = ['L', 'M', 'X', 'J', 'V', 'S', 'D'];

export function isoDate(y: number, m: number, d: number): string {
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type CalendarProps = {
  slots: Slot[];
  /** Día seleccionado (YYYY-MM-DD). */
  value?: string | null;
  onSelectDay?: (date: string) => void;
  /** Modo del panel: permite marcar días sin franjas para publicarlos. */
  selectable?: 'con-franja' | 'cualquier-dia-futuro';
  multi?: Set<string>;
  onToggleMulti?: (date: string) => void;
};

/**
 * Calendario mensual. En el lado público muestra los días con franjas libres;
 * en el panel del fotógrafo permite seleccionar días para publicar agenda.
 */
export function Calendar({
  slots,
  value,
  onSelectDay,
  selectable = 'con-franja',
  multi,
  onToggleMulti,
}: CalendarProps) {
  const now = new Date();
  const [cursor, setCursor] = useState({ year: now.getFullYear(), month: now.getMonth() });

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const list = map.get(s.date) ?? [];
      list.push(s);
      map.set(s.date, list);
    }
    return map;
  }, [slots]);

  const grid = useMemo(() => {
    const first = new Date(Date.UTC(cursor.year, cursor.month, 1));
    const days = new Date(Date.UTC(cursor.year, cursor.month + 1, 0)).getUTCDate();
    const leading = (first.getUTCDay() + 6) % 7; // lunes primero
    return [
      ...Array.from({ length: leading }, () => null),
      ...Array.from({ length: days }, (_, i) => i + 1),
    ];
  }, [cursor]);

  const today = todayIso();

  function shift(delta: number) {
    setCursor((c) => {
      const m = c.month + delta;
      return { year: c.year + Math.floor(m / 12), month: ((m % 12) + 12) % 12 };
    });
  }

  return (
    <div>
      <div className="mb-4 flex items-center justify-between gap-2">
        <button type="button" onClick={() => shift(-1)} className="btn btn-ghost shrink-0" aria-label="Mes anterior">
          ←
        </button>
        <h3 className="truncate font-[family-name:var(--font-display)] text-base font-semibold text-bone">
          {MONTHS[cursor.month]} {cursor.year}
        </h3>
        <button type="button" onClick={() => shift(1)} className="btn btn-ghost shrink-0" aria-label="Mes siguiente">
          →
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAYS.map((d, i) => (
          <div key={i} className="py-1.5 text-center text-[11px] font-semibold text-bone-mute">
            {d}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1 sm:gap-1.5">
        {grid.map((day, i) => {
          if (day === null) return <div key={`e${i}`} />;

          const iso = isoDate(cursor.year, cursor.month, day);
          const daySlots = byDay.get(iso) ?? [];
          const free = daySlots.filter((s) => (s.status ?? 'DISPONIBLE') === 'DISPONIBLE');
          const taken = daySlots.filter((s) => s.status && s.status !== 'DISPONIBLE');
          const isPast = iso < today;
          const isSelected = value === iso;
          const isMulti = multi?.has(iso) ?? false;

          const clickable =
            !isPast &&
            (selectable === 'cualquier-dia-futuro' ? true : free.length > 0);

          const style = isMulti
            ? 'border-lime bg-lime text-ink font-semibold'
            : isSelected
              ? 'border-lime bg-lime/20 text-lime font-semibold'
              : taken.length > 0 && free.length === 0
                ? 'border-success/50 bg-success/10 text-success'
                : free.length > 0
                  ? 'border-bone-mute/50 text-bone hover:border-lime'
                  : isPast
                    ? 'border-ink-line text-bone-mute/30'
                    : 'border-ink-line text-bone-mute/60';

          return (
            <button
              key={iso}
              type="button"
              disabled={!clickable}
              onClick={() => {
                if (onToggleMulti) onToggleMulti(iso);
                else onSelectDay?.(iso);
              }}
              className={`relative aspect-square min-h-11 border text-sm transition-colors ${style} ${
                clickable ? 'cursor-pointer' : 'cursor-not-allowed'
              }`}
              title={
                taken.length > 0
                  ? `${taken.length} cita(s)`
                  : free.length > 0
                    ? free.map((s) => TURN_LABEL[s.turn]).join(' · ')
                    : undefined
              }
            >
              {day}
              {/* Puntos: una marca por franja del día */}
              {daySlots.length > 0 && !isMulti && (
                <span className="absolute bottom-1 left-1/2 flex -translate-x-1/2 gap-0.5">
                  {daySlots.slice(0, 3).map((s, k) => (
                    <span
                      key={k}
                      className={`h-1 w-1 rounded-full ${
                        (s.status ?? 'DISPONIBLE') === 'DISPONIBLE' ? 'bg-lime' : 'bg-success'
                      }`}
                    />
                  ))}
                </span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function CalendarLegend({ items }: { items: { className: string; label: string }[] }) {
  return (
    <div className="mt-5 flex flex-wrap gap-4 border-t border-ink-line pt-4 text-xs">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-2 text-bone-dim">
          <span className={`h-3 w-3 border ${i.className}`} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
