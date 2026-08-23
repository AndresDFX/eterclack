import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { SlotTurn } from '@prisma/client';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido');
const turnSchema = z.enum(['MANANA', 'TARDE', 'DIA_COMPLETO']);

function toUTCDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

function todayUTC(): Date {
  const n = new Date();
  return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth(), n.getUTCDate()));
}

/**
 * Calendario interno.
 *
 * El fotógrafo PUBLICA las franjas en las que puede trabajar. Lo que no está
 * publicado no existe para el cliente: no hay forma de pedir una cita fuera
 * del calendario.
 */
export default async function slotRoutes(app: FastifyInstance): Promise<void> {
  // ─── Público: franjas libres de un fotógrafo aprobado ───────
  app.get('/:slug/slots', async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const parsed = z
      .object({ from: dateSchema.optional(), to: dateSchema.optional() })
      .safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'filtros_invalidos' });

    const photographer = await prisma.photographerProfile.findFirst({
      where: { slug, status: 'APPROVED' },
      select: { id: true },
    });
    if (!photographer) return reply.code(404).send({ error: 'no_encontrado' });

    const from = parsed.data.from ? toUTCDate(parsed.data.from) : todayUTC();
    const to = parsed.data.to
      ? toUTCDate(parsed.data.to)
      : new Date(Date.now() + 180 * 24 * 60 * 60 * 1000);

    // Una retención vencida vuelve a estar libre: no se puede secuestrar
    // una fecha dejando una reserva a medias.
    await releaseExpiredHolds(photographer.id);

    const slots = await prisma.availabilitySlot.findMany({
      where: {
        photographerId: photographer.id,
        date: { gte: from, lte: to },
        status: 'DISPONIBLE',
      },
      orderBy: [{ date: 'asc' }, { turn: 'asc' }],
      select: { id: true, date: true, turn: true, note: true },
    });

    return reply.send({
      slots: slots.map((s) => ({
        id: s.id,
        date: s.date.toISOString().slice(0, 10),
        turn: s.turn,
        note: s.note,
      })),
    });
  });

  // ─── Panel: agenda completa del fotógrafo ───────────────────
  app.get('/me/slots', {
    preHandler: [app.requireRole('PHOTOGRAPHER')],
  }, async (req, reply) => {
    const profile = await prisma.photographerProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!profile) return reply.code(404).send({ error: 'sin_perfil' });

    await releaseExpiredHolds(profile.id);

    const slots = await prisma.availabilitySlot.findMany({
      where: { photographerId: profile.id, date: { gte: todayUTC() } },
      orderBy: [{ date: 'asc' }, { turn: 'asc' }],
      select: {
        id: true,
        date: true,
        turn: true,
        status: true,
        note: true,
        order: {
          select: { id: true, code: true, status: true, client: { select: { fullName: true } } },
        },
      },
    });

    return reply.send({
      slots: slots.map((s) => ({
        id: s.id,
        date: s.date.toISOString().slice(0, 10),
        turn: s.turn,
        status: s.status,
        note: s.note,
        order: s.order,
      })),
    });
  });

  // ─── Panel: publicar franjas ────────────────────────────────
  app.post('/me/slots', {
    preHandler: [app.requireRole('PHOTOGRAPHER')],
  }, async (req, reply) => {
    const parsed = z
      .object({
        dates: z.array(dateSchema).min(1).max(90),
        turn: turnSchema.default('DIA_COMPLETO'),
        note: z.string().max(200).optional(),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'datos_invalidos', issues: parsed.error.issues });
    }

    const profile = await prisma.photographerProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true, status: true },
    });
    if (!profile) return reply.code(404).send({ error: 'sin_perfil' });

    const dates = parsed.data.dates.map(toUTCDate);
    const today = todayUTC();
    if (dates.some((d) => d < today)) {
      return reply.code(400).send({
        error: 'fecha_pasada',
        message: 'No puedes publicar disponibilidad en fechas pasadas.',
      });
    }

    const created = await prisma.availabilitySlot.createMany({
      data: dates.map((date) => ({
        photographerId: profile.id,
        date,
        turn: parsed.data.turn,
        note: parsed.data.note ?? null,
      })),
      skipDuplicates: true,
    });

    await audit({
      actorId: req.user!.id,
      actorRole: 'PHOTOGRAPHER',
      action: 'slots.published',
      entityType: 'PhotographerProfile',
      entityId: profile.id,
      after: { dates: parsed.data.dates, turn: parsed.data.turn },
      ip: req.ip,
    });

    return reply.code(201).send({ ok: true, created: created.count });
  });

  // ─── Panel: retirar franjas ─────────────────────────────────
  app.delete('/me/slots', {
    preHandler: [app.requireRole('PHOTOGRAPHER')],
  }, async (req, reply) => {
    const parsed = z.object({ slotIds: z.array(z.string().uuid()).min(1).max(90) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

    const profile = await prisma.photographerProfile.findUnique({
      where: { userId: req.user!.id },
      select: { id: true },
    });
    if (!profile) return reply.code(404).send({ error: 'sin_perfil' });

    // Una franja tomada por un cliente no se retira desde aquí: eso sería
    // cancelar una cita, que es otra operación con sus propias reglas.
    const taken = await prisma.availabilitySlot.findMany({
      where: {
        id: { in: parsed.data.slotIds },
        photographerId: profile.id,
        status: { not: 'DISPONIBLE' },
      },
      select: { date: true, turn: true },
    });
    if (taken.length > 0) {
      return reply.code(409).send({
        error: 'franjas_ocupadas',
        message: 'Algunas franjas ya tienen una cita y no se pueden retirar.',
        slots: taken.map((t) => `${t.date.toISOString().slice(0, 10)} ${t.turn}`),
      });
    }

    const deleted = await prisma.availabilitySlot.deleteMany({
      where: { id: { in: parsed.data.slotIds }, photographerId: profile.id, status: 'DISPONIBLE' },
    });

    await audit({
      actorId: req.user!.id,
      actorRole: 'PHOTOGRAPHER',
      action: 'slots.withdrawn',
      entityType: 'PhotographerProfile',
      entityId: profile.id,
      after: { count: deleted.count },
      ip: req.ip,
    });

    return reply.send({ ok: true, deleted: deleted.count });
  });
}

/** Devuelve al mercado las franjas cuya retención expiró sin pago. */
export async function releaseExpiredHolds(photographerId?: string): Promise<number> {
  const { count } = await prisma.availabilitySlot.updateMany({
    where: {
      status: 'RETENIDA',
      holdExpiresAt: { lt: new Date() },
      ...(photographerId ? { photographerId } : {}),
    },
    data: { status: 'DISPONIBLE', holdExpiresAt: null },
  });
  return count;
}

/** Reglas de solapamiento: día completo bloquea el día; mañana y tarde conviven. */
export function conflictingTurns(turn: SlotTurn): SlotTurn[] {
  return turn === 'DIA_COMPLETO'
    ? ['MANANA', 'TARDE', 'DIA_COMPLETO']
    : ['DIA_COMPLETO', turn];
}
