import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../env.js';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { sendMail } from '../../lib/mailer.js';

export default async function adminRoutes(app: FastifyInstance): Promise<void> {
  // Todo este módulo exige rol ADMIN.
  app.addHook('preHandler', app.requireRole('ADMIN'));

  // ─── Dashboard ──────────────────────────────────────────────
  app.get('/dashboard', async (_req, reply) => {
    const [clients, photographers, pending, orders, emailsFailed] = await Promise.all([
      prisma.user.count({ where: { role: 'CLIENT', status: 'ACTIVE' } }),
      prisma.photographerProfile.count({ where: { status: 'APPROVED' } }),
      prisma.photographerProfile.count({ where: { status: 'PENDING' } }),
      prisma.order.groupBy({ by: ['status'], _count: true }),
      prisma.email.count({ where: { status: 'FAILED' } }),
    ]);

    return reply.send({
      metrics: {
        clients,
        photographersApproved: photographers,
        photographersPending: pending,
        ordersByStatus: Object.fromEntries(orders.map((o) => [o.status, o._count])),
        emailsFailed,
      },
    });
  });

  // ─── Fotógrafos: revisión y aprobación ──────────────────────
  app.get('/photographers', async (req, reply) => {
    const parsed = z
      .object({
        status: z.enum(['PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
        page: z.coerce.number().int().min(1).default(1),
        perPage: z.coerce.number().int().min(1).max(100).default(20),
      })
      .safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'filtros_invalidos' });

    const { status, page, perPage } = parsed.data;
    const where = status ? { status } : {};

    const [total, rows] = await Promise.all([
      prisma.photographerProfile.count({ where }),
      prisma.photographerProfile.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          slug: true,
          status: true,
          headline: true,
          bio: true,
          priceFromCents: true,
          createdAt: true,
          approvedAt: true,
          rejectionReason: true,
          bankVerifiedAt: true,
          user: { select: { id: true, fullName: true, email: true, phone: true, emailVerifiedAt: true } },
          specialties: { select: { specialty: { select: { name: true } } } },
          zones: { select: { zone: { select: { name: true } } } },
          _count: { select: { portfolio: true, packages: true } },
        },
      }),
    ]);

    return reply.send({
      total,
      page,
      perPage,
      pages: Math.ceil(total / perPage),
      photographers: rows.map((p) => ({
        ...p,
        specialties: p.specialties.map((s) => s.specialty.name),
        zones: p.zones.map((z) => z.zone.name),
      })),
    });
  });

  app.post('/photographers/:id/approve', async (req, reply) => {
    const { id } = req.params as { id: string };

    const profile = await prisma.photographerProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!profile) return reply.code(404).send({ error: 'no_encontrado' });
    if (profile.status === 'APPROVED') return reply.send({ ok: true, alreadyApproved: true });

    await prisma.$transaction(async (tx) => {
      await tx.photographerProfile.update({
        where: { id },
        data: {
          status: 'APPROVED',
          approvedAt: new Date(),
          approvedBy: req.user!.id,
          rejectionReason: null,
        },
      });
      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'ADMIN',
          action: 'photographer.approved',
          entityType: 'PhotographerProfile',
          entityId: id,
          before: { status: profile.status },
          after: { status: 'APPROVED' },
          ip: req.ip,
        },
        tx,
      );
    });

    await sendMail({
      template: 'photographer-approved',
      to: profile.user.email,
      data: {
        name: profile.user.fullName,
        profileUrl: `${env.WEB_URL}/fotografos/${profile.slug}`,
      },
    });

    return reply.send({ ok: true });
  });

  app.post('/photographers/:id/reject', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ reason: z.string().min(10, 'Explica el motivo con al menos 10 caracteres').max(500) })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'datos_invalidos', issues: parsed.error.issues });
    }

    const profile = await prisma.photographerProfile.findUnique({
      where: { id },
      include: { user: true },
    });
    if (!profile) return reply.code(404).send({ error: 'no_encontrado' });

    await prisma.$transaction(async (tx) => {
      await tx.photographerProfile.update({
        where: { id },
        data: { status: 'REJECTED', rejectionReason: parsed.data.reason },
      });
      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'ADMIN',
          action: 'photographer.rejected',
          entityType: 'PhotographerProfile',
          entityId: id,
          before: { status: profile.status },
          after: { status: 'REJECTED', reason: parsed.data.reason },
          ip: req.ip,
        },
        tx,
      );
    });

    await sendMail({
      template: 'photographer-rejected',
      to: profile.user.email,
      data: { name: profile.user.fullName, reason: parsed.data.reason },
    });

    return reply.send({ ok: true });
  });

  app.post('/photographers/:id/suspend', async (req, reply) => {
    const { id } = req.params as { id: string };
    const profile = await prisma.photographerProfile.findUnique({ where: { id } });
    if (!profile) return reply.code(404).send({ error: 'no_encontrado' });

    await prisma.$transaction(async (tx) => {
      await tx.photographerProfile.update({ where: { id }, data: { status: 'SUSPENDED' } });
      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'ADMIN',
          action: 'photographer.suspended',
          entityType: 'PhotographerProfile',
          entityId: id,
          before: { status: profile.status },
          after: { status: 'SUSPENDED' },
          ip: req.ip,
        },
        tx,
      );
    });

    return reply.send({ ok: true });
  });

  // ─── Configuración ──────────────────────────────────────────
  app.get('/settings', async (_req, reply) => {
    const rows = await prisma.setting.findMany({ orderBy: { key: 'asc' } });
    return reply.send({ settings: rows });
  });

  app.put('/settings/:key', async (req, reply) => {
    const { key } = req.params as { key: string };
    const parsed = z.object({ value: z.unknown() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

    // La comisión es un entero en puntos base: nunca un decimal.
    if (key === 'platform_commission_bps') {
      const bps = z.coerce.number().int().min(0).max(10_000).safeParse(parsed.data.value);
      if (!bps.success) {
        return reply.code(400).send({
          error: 'valor_invalido',
          message: 'La comisión debe ser un entero entre 0 y 10000 puntos base.',
        });
      }
    }

    const before = await prisma.setting.findUnique({ where: { key } });

    const setting = await prisma.setting.upsert({
      where: { key },
      create: { key, value: parsed.data.value as never, updatedBy: req.user!.id },
      update: { value: parsed.data.value as never, updatedBy: req.user!.id },
    });

    await audit({
      actorId: req.user!.id,
      actorRole: 'ADMIN',
      action: 'setting.updated',
      entityType: 'Setting',
      entityId: key,
      before: before?.value,
      after: setting.value,
      ip: req.ip,
    });

    return reply.send({ setting });
  });

  // ─── Auditoría ──────────────────────────────────────────────
  app.get('/audit', async (req, reply) => {
    const parsed = z
      .object({
        entityType: z.string().optional(),
        entityId: z.string().optional(),
        page: z.coerce.number().int().min(1).default(1),
        perPage: z.coerce.number().int().min(1).max(100).default(50),
      })
      .safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'filtros_invalidos' });

    const { entityType, entityId, page, perPage } = parsed.data;
    const where = { ...(entityType ? { entityType } : {}), ...(entityId ? { entityId } : {}) };

    const [total, entries] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
      }),
    ]);

    return reply.send({ total, page, perPage, entries });
  });

  // ─── Correo: bandeja operativa ──────────────────────────────
  app.get('/emails', async (req, reply) => {
    const parsed = z
      .object({
        status: z.enum(['QUEUED', 'SENT', 'FAILED', 'SUPPRESSED']).optional(),
        page: z.coerce.number().int().min(1).default(1),
      })
      .safeParse(req.query);
    if (!parsed.success) return reply.code(400).send({ error: 'filtros_invalidos' });

    const where = parsed.data.status ? { status: parsed.data.status } : {};
    const [total, emails] = await Promise.all([
      prisma.email.count({ where }),
      prisma.email.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (parsed.data.page - 1) * 50,
        take: 50,
      }),
    ]);

    return reply.send({ total, emails });
  });
}
