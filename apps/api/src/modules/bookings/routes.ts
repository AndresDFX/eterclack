import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { sendMail } from '../../lib/mailer.js';
import { splitAmount } from '../../lib/money.js';
import { nextCode } from '../../lib/codes.js';
import { env } from '../../env.js';
import { conflictingTurns, releaseExpiredHolds } from '../slots/routes.js';

/** Horas que se retiene la franja mientras el cliente firma y paga. */
const HOLD_HOURS = 24;

const bookSchema = z.object({
  slotId: z.string().uuid('Elige una fecha del calendario'),
  packageId: z.string().uuid('Elige uno de los tres productos'),
  notes: z.string().max(1000).optional(),
  zoneId: z.string().uuid().optional(),
});

/**
 * Reserva directa.
 *
 * El cliente elige una franja publicada y uno de los tres productos. No hay
 * negociación: el precio del paquete es el precio. La franja queda retenida
 * hasta que se firme el contrato y se pague, o hasta que expire la retención.
 */
export default async function bookingRoutes(app: FastifyInstance): Promise<void> {
  app.post('/', {
    preHandler: [app.requireVerified, app.requireRole('CLIENT')],
    config: { rateLimit: { max: 20, timeWindow: '1 hour' } },
  }, async (req, reply) => {
    const parsed = bookSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'datos_invalidos', issues: parsed.error.issues });
    }

    await releaseExpiredHolds();

    const [slot, pkg] = await Promise.all([
      prisma.availabilitySlot.findUnique({
        where: { id: parsed.data.slotId },
        include: {
          photographer: {
            include: {
              user: true,
              zones: { include: { zone: true } },
              specialties: { include: { specialty: true } },
            },
          },
        },
      }),
      prisma.package.findUnique({ where: { id: parsed.data.packageId } }),
    ]);

    if (!slot || !pkg) {
      return reply.code(404).send({ error: 'no_encontrado', message: 'La fecha o el producto ya no existen.' });
    }
    if (pkg.photographerId !== slot.photographerId || !pkg.active) {
      return reply.code(400).send({
        error: 'producto_invalido',
        message: 'Ese producto no pertenece a este fotógrafo.',
      });
    }
    if (slot.photographer.status !== 'APPROVED') {
      return reply.code(409).send({ error: 'fotografo_no_disponible' });
    }
    if (slot.status !== 'DISPONIBLE') {
      return reply.code(409).send({
        error: 'franja_ocupada',
        message: 'Alguien acaba de tomar esa fecha. Elige otra del calendario.',
      });
    }

    // Zona: la indicada por el cliente si el fotógrafo la cubre; si no, la primera suya.
    const coveredZoneIds = slot.photographer.zones.map((z) => z.zoneId);
    const zoneId =
      parsed.data.zoneId && coveredZoneIds.includes(parsed.data.zoneId)
        ? parsed.data.zoneId
        : coveredZoneIds[0];
    const specialtyId = slot.photographer.specialties[0]?.specialtyId;

    if (!zoneId || !specialtyId) {
      return reply.code(409).send({
        error: 'perfil_incompleto',
        message: 'Este fotógrafo aún no tiene zona o especialidad configurada.',
      });
    }

    // La comisión se congela en la orden: si mañana cambia la global,
    // esta reserva conserva la que se pactó hoy.
    const setting = await prisma.setting.findUnique({ where: { key: 'platform_commission_bps' } });
    const commissionBps =
      slot.photographer.commissionBps ??
      (typeof setting?.value === 'number' ? setting.value : env.PLATFORM_COMMISSION_BPS);

    const { commissionCents, photographerCents } = splitAmount(pkg.priceCents, commissionBps);

    let order;
    try {
      order = await prisma.$transaction(async (tx) => {
        // Cierre de la carrera: solo pasa a RETENIDA si sigue DISPONIBLE.
        const held = await tx.availabilitySlot.updateMany({
          where: { id: slot.id, status: 'DISPONIBLE' },
          data: {
            status: 'RETENIDA',
            holdExpiresAt: new Date(Date.now() + HOLD_HOURS * 60 * 60 * 1000),
          },
        });
        if (held.count === 0) throw new Error('FRANJA_TOMADA');

        // Un día completo se lleva la jornada entera.
        await tx.availabilitySlot.deleteMany({
          where: {
            photographerId: slot.photographerId,
            date: slot.date,
            turn: { in: conflictingTurns(slot.turn) },
            status: 'DISPONIBLE',
            id: { not: slot.id },
          },
        });

        const created = await tx.order.create({
          data: {
            code: await nextCode(tx, 'order', 'ETC'),
            clientId: req.user!.id,
            photographerId: slot.photographerId,
            packageId: pkg.id,
            slotId: slot.id,
            zoneId,
            specialtyId,
            eventDate: slot.date,
            notes: parsed.data.notes ?? null,
            amountCents: pkg.priceCents,
            commissionBps,
            commissionCents,
            photographerCents,
            maxSelectablePhotos: pkg.maxSelectablePhotos,
          },
        });

        await audit(
          {
            actorId: req.user!.id,
            actorRole: 'CLIENT',
            action: 'booking.created',
            entityType: 'Order',
            entityId: created.id,
            after: {
              slot: `${slot.date.toISOString().slice(0, 10)} ${slot.turn}`,
              tier: pkg.tier,
              amountCents: pkg.priceCents.toString(),
              commissionBps,
            },
            ip: req.ip,
          },
          tx,
        );

        return created;
      });
    } catch (e) {
      if (e instanceof Error && e.message === 'FRANJA_TOMADA') {
        return reply.code(409).send({
          error: 'franja_ocupada',
          message: 'Alguien acaba de tomar esa fecha. Elige otra del calendario.',
        });
      }
      throw e;
    }

    await sendMail({
      template: 'booking-created-photographer',
      to: slot.photographer.user.email,
      data: {
        name: slot.photographer.user.fullName,
        clientName: req.user!.fullName,
        eventDate: slot.date.toISOString().slice(0, 10),
        turn: slot.turn,
        packageName: pkg.name,
        amountCents: pkg.priceCents.toString(),
        url: `${env.WEB_URL}/panel/citas`,
      },
    });

    await sendMail({
      template: 'booking-created-client',
      to: req.user!.email,
      priority: 1,
      data: {
        name: req.user!.fullName,
        photographerName: slot.photographer.user.fullName,
        eventDate: slot.date.toISOString().slice(0, 10),
        packageName: pkg.name,
        amountCents: pkg.priceCents.toString(),
        holdHours: HOLD_HOURS,
        url: `${env.WEB_URL}/ordenes/${order.id}`,
      },
    });

    return reply.code(201).send({ order });
  });
}
