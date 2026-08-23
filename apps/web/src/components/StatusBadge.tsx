type Tone = 'neutral' | 'info' | 'success' | 'warn' | 'danger';

const REQUEST_STATUS: Record<string, { label: string; tone: Tone }> = {
  NUEVA: { label: 'Nueva', tone: 'info' },
  EN_REVISION: { label: 'En revisión', tone: 'info' },
  PROPUESTA: { label: 'Propuesta enviada', tone: 'warn' },
  ACEPTADA: { label: 'Aceptada', tone: 'success' },
  RECHAZADA: { label: 'Rechazada', tone: 'danger' },
  VENCIDA: { label: 'Vencida', tone: 'neutral' },
};

const ORDER_STATUS: Record<string, { label: string; tone: Tone }> = {
  BORRADOR: { label: 'Falta aceptar contrato', tone: 'warn' },
  CONTRATO_ACEPTADO: { label: 'Contrato aceptado', tone: 'info' },
  PAGO_PENDIENTE: { label: 'Pago pendiente', tone: 'warn' },
  RESERVADA: { label: 'Reservada', tone: 'success' },
  EN_PRODUCCION: { label: 'En producción', tone: 'info' },
  SELECCION: { label: 'En selección', tone: 'info' },
  ENTREGA_LISTA: { label: 'Entrega lista', tone: 'success' },
  COMPLETADA: { label: 'Completada', tone: 'success' },
  CANCELADA: { label: 'Cancelada', tone: 'danger' },
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: 'border-ink-line text-bone-mute',
  info: 'border-bone-mute text-bone',
  success: 'border-success text-success',
  warn: 'border-warn text-warn',
  danger: 'border-danger text-danger',
};

export function StatusBadge({ status, kind }: { status: string; kind: 'request' | 'order' }) {
  const map = kind === 'request' ? REQUEST_STATUS : ORDER_STATUS;
  const entry = map[status] ?? { label: status, tone: 'neutral' as Tone };

  return <span className={`chip ${TONE_CLASS[entry.tone]}`}>{entry.label}</span>;
}

/** 15 de noviembre de 2026 */
export function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('es-CO', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/** 15 nov 2026, 14:30 */
export function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('es-CO', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}
