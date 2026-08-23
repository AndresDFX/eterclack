import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { publicUrl } from '../../lib/s3.js';

const searchSchema = z.object({
  q: z.string().trim().max(80).optional(),
  specialty: z.string().trim().optional(), // slug
  zone: z.string().trim().optional(), // slug
  minCents: z.coerce.number().int().nonnegative().optional(),
  maxCents: z.coerce.number().int().nonnegative().optional(),
  sort: z.enum(['recientes', 'precio_asc', 'precio_desc']).default('recientes'),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(48).default(12),
});

const profileUpdateSchema = z.object({
  headline: z.string().max(120).trim().optional(),
  bio: z.string().max(2000).trim().optional(),
  priceFromCents: z.coerce.bigint().nonnegative().optional(),
  instagram: z.string().max(120).trim().optional(),
  website: z.string().max(200).trim().optional(),
  specialtyIds: z.array(z.string().uuid()).max(8).optional(),
  zoneIds: z.array(z.string().uuid()).max(12).optional(),
});

export default async function photographerRoutes(app: FastifyInstance): Promise<void> {
  // ─── Descubrimiento público ─────────────────────────────────
  // Solo perfiles APPROVED. Un perfil pendiente o suspendido no existe aquí.
  app.get('/', async (req, reply) => {
    const parsed = searchSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'filtros_invalidos', issues: parsed.error.issues });
    }
    const { q, specialty, zone, minCents, maxCents, sort, page, perPage } = parsed.data;

    const where = {
      status: 'APPROVED' as const,
      ...(q
        ? {
            OR: [
              { user: { fullName: { contains: q, mode: 'insensitive' as const } } },
              { headline: { contains: q, mode: 'insensitive' as const } },
              { bio: { contains: q, mode: 'insensitive' as const } },
            ],
          }
        : {}),
      ...(specialty ? { specialties: { some: { specialty: { slug: specialty } } } } : {}),
      ...(zone ? { zones: { some: { zone: { slug: zone } } } } : {}),
      ...(minCents !== undefined || maxCents !== undefined
        ? {
            priceFromCents: {
              ...(minCents !== undefined ? { gte: BigInt(minCents) } : {}),
              ...(maxCents !== undefined ? { lte: BigInt(maxCents) } : {}),
            },
          }
        : {}),
    };

    const orderBy =
      sort === 'precio_asc'
        ? { priceFromCents: 'asc' as const }
        : sort === 'precio_desc'
          ? { priceFromCents: 'desc' as const }
          : { approvedAt: 'desc' as const };

    const [total, rows] = await Promise.all([
      prisma.photographerProfile.count({ where }),
      prisma.photographerProfile.findMany({
        where,
        orderBy,
        skip: (page - 1) * perPage,
        take: perPage,
        select: {
          id: true,
          slug: true,
          headline: true,
          priceFromCents: true,
          avatarKey: true,
          coverKey: true,
          user: { select: { fullName: true } },
          specialties: { select: { specialty: { select: { slug: true, name: true } } } },
          zones: { select: { zone: { select: { slug: true, name: true } } } },
          portfolio: { take: 3, orderBy: { sortOrder: 'asc' }, select: { thumbKey: true, imageKey: true } },
        },
      }),
    ]);

    return reply.send({
      total,
      page,
      perPage,
      pages: Math.ceil(total / perPage),
      photographers: rows.map((p) => ({
        id: p.id,
        slug: p.slug,
        fullName: p.user.fullName,
        headline: p.headline,
        priceFromCents: p.priceFromCents,
        avatarUrl: publicUrl(p.avatarKey),
        coverUrl: publicUrl(p.coverKey),
        specialties: p.specialties.map((s) => s.specialty),
        zones: p.zones.map((z) => z.zone),
        preview: p.portfolio.map((i) => publicUrl(i.thumbKey ?? i.imageKey)),
      })),
    });
  });

  // ─── Ficha pública ──────────────────────────────────────────
  app.get('/:slug', async (req, reply) => {
    const { slug } = req.params as { slug: string };

    const p = await prisma.photographerProfile.findFirst({
      where: { slug, status: 'APPROVED' },
      select: {
        id: true,
        slug: true,
        headline: true,
        bio: true,
        priceFromCents: true,
        avatarKey: true,
        coverKey: true,
        instagram: true,
        website: true,
        user: { select: { fullName: true } },
        specialties: { select: { specialty: { select: { id: true, slug: true, name: true } } } },
        zones: { select: { zone: { select: { id: true, slug: true, name: true } } } },
        portfolio: { orderBy: { sortOrder: 'asc' }, select: { id: true, imageKey: true, thumbKey: true, caption: true } },
        packages: {
          where: { active: true },
          orderBy: { priceCents: 'asc' },
          select: {
            id: true,
            tier: true,
            name: true,
            description: true,
            includes: true,
            priceCents: true,
            hours: true,
            maxSelectablePhotos: true,
            deliveryDays: true,
          },
        },
      },
    });

    if (!p) {
      return reply.code(404).send({ error: 'no_encontrado', message: 'Ese fotógrafo no existe o no está disponible.' });
    }

    return reply.send({
      photographer: {
        ...p,
        fullName: p.user.fullName,
        avatarUrl: publicUrl(p.avatarKey),
        coverUrl: publicUrl(p.coverKey),
        specialties: p.specialties.map((s) => s.specialty),
        zones: p.zones.map((z) => z.zone),
        portfolio: p.portfolio.map((i) => ({
          id: i.id,
          caption: i.caption,
          url: publicUrl(i.imageKey),
          thumbUrl: publicUrl(i.thumbKey ?? i.imageKey),
        })),
      },
    });
  });

  // ─── Panel del fotógrafo ────────────────────────────────────
  app.get('/me/profile', {
    preHandler: [app.requireRole('PHOTOGRAPHER')],
  }, async (req, reply) => {
    const profile = await prisma.photographerProfile.findUnique({
      where: { userId: req.user!.id },
      include: {
        specialties: { select: { specialtyId: true } },
        zones: { select: { zoneId: true } },
        packages: { orderBy: { priceCents: 'asc' } },
        portfolio: { orderBy: { sortOrder: 'asc' } },
      },
    });
    if (!profile) return reply.code(404).send({ error: 'sin_perfil' });

    return reply.send({
      profile: {
        ...profile,
        specialtyIds: profile.specialties.map((s) => s.specialtyId),
        zoneIds: profile.zones.map((z) => z.zoneId),
        avatarUrl: publicUrl(profile.avatarKey),
        coverUrl: publicUrl(profile.coverKey),
      },
    });
  });

  app.patch('/me/profile', {
    preHandler: [app.requireRole('PHOTOGRAPHER')],
  }, async (req, reply) => {
    const parsed = profileUpdateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'datos_invalidos', issues: parsed.error.issues });
    }
    const { specialtyIds, zoneIds, ...fields } = parsed.data;

    const current = await prisma.photographerProfile.findUnique({
      where: { userId: req.user!.id },
    });
    if (!current) return reply.code(404).send({ error: 'sin_perfil' });

    const updated = await prisma.$transaction(async (tx) => {
      const profile = await tx.photographerProfile.update({
        where: { id: current.id },
        data: fields,
      });

      if (specialtyIds) {
        await tx.photographerSpecialty.deleteMany({ where: { photographerId: current.id } });
        await tx.photographerSpecialty.createMany({
          data: specialtyIds.map((specialtyId) => ({ photographerId: current.id, specialtyId })),
        });
      }
      if (zoneIds) {
        await tx.photographerZone.deleteMany({ where: { photographerId: current.id } });
        await tx.photographerZone.createMany({
          data: zoneIds.map((zoneId) => ({ photographerId: current.id, zoneId })),
        });
      }

      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'PHOTOGRAPHER',
          action: 'photographer.profile_updated',
          entityType: 'PhotographerProfile',
          entityId: current.id,
          before: { headline: current.headline, priceFromCents: current.priceFromCents?.toString() },
          after: { headline: profile.headline, priceFromCents: profile.priceFromCents?.toString() },
          ip: req.ip,
        },
        tx,
      );

      return profile;
    });

    return reply.send({ profile: updated });
  });

  /** Reenviar a revisión tras un rechazo. */
  app.post('/me/reapply', {
    preHandler: [app.requireRole('PHOTOGRAPHER')],
  }, async (req, reply) => {
    const profile = await prisma.photographerProfile.findUnique({
      where: { userId: req.user!.id },
    });
    if (!profile) return reply.code(404).send({ error: 'sin_perfil' });
    if (profile.status !== 'REJECTED') {
      return reply.code(409).send({
        error: 'estado_invalido',
        message: 'Solo un perfil rechazado puede volver a postularse.',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.photographerProfile.update({
        where: { id: profile.id },
        data: { status: 'PENDING', rejectionReason: null },
      });
      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'PHOTOGRAPHER',
          action: 'photographer.reapplied',
          entityType: 'PhotographerProfile',
          entityId: profile.id,
          before: { status: 'REJECTED' },
          after: { status: 'PENDING' },
          ip: req.ip,
        },
        tx,
      );
    });

    return reply.send({ ok: true });
  });
}
