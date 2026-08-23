import type { Prisma } from '@prisma/client';

/**
 * Códigos secuenciales legibles para el usuario: SOL-2026-000042, ETC-2026-000017.
 *
 * Se cuenta dentro de la misma transacción que crea el registro. En el volumen
 * del MVP la colisión es improbable, y el índice único del campo `code` la
 * convertiría en un error visible, nunca en dos registros con el mismo código.
 */
export async function nextCode(
  tx: Prisma.TransactionClient,
  model: 'order' | 'payoutRun',
  prefix: string,
): Promise<string> {
  const year = new Date().getUTCFullYear();
  const start = new Date(Date.UTC(year, 0, 1));

  const count =
    model === 'order'
      ? await tx.order.count({ where: { createdAt: { gte: start } } })
      : await tx.payoutRun.count({ where: { createdAt: { gte: start } } });

  return `${prefix}-${year}-${String(count + 1).padStart(6, '0')}`;
}
