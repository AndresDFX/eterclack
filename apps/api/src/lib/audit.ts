import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../db.js';

type AuditInput = {
  actorId?: string | null;
  actorRole?: Role | null;
  action: string;
  entityType: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
};

/**
 * Toda transición de estado, cambio de contrato, pago, publicación y dispersión
 * queda registrada aquí. Acepta un cliente transaccional para escribir dentro
 * de la misma transacción que produjo el cambio.
 */
export async function audit(
  input: AuditInput,
  tx: Prisma.TransactionClient = prisma,
): Promise<void> {
  await tx.auditLog.create({
    data: {
      actorId: input.actorId ?? null,
      actorRole: input.actorRole ?? null,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      before: (input.before ?? undefined) as Prisma.InputJsonValue | undefined,
      after: (input.after ?? undefined) as Prisma.InputJsonValue | undefined,
      ip: input.ip ?? null,
    },
  });
}
