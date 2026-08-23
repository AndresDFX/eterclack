import type { FastifyInstance } from 'fastify';
import { prisma } from '../../db.js';

export default async function catalogRoutes(app: FastifyInstance): Promise<void> {
  app.get('/specialties', async (_req, reply) => {
    const specialties = await prisma.specialty.findMany({
      where: { active: true },
      orderBy: { name: 'asc' },
      select: { id: true, slug: true, name: true, icon: true },
    });
    return reply.send({ specialties });
  });

  app.get('/zones', async (_req, reply) => {
    const zones = await prisma.zone.findMany({
      where: { active: true },
      orderBy: [{ department: 'asc' }, { name: 'asc' }],
      select: { id: true, slug: true, name: true, department: true },
    });
    return reply.send({ zones });
  });

  /** Configuración pública: la UI necesita saber la comisión y los mínimos. */
  app.get('/settings', async (_req, reply) => {
    const rows = await prisma.setting.findMany({
      where: { key: { in: ['platform_commission_bps', 'payout_hold_days'] } },
    });
    const settings = Object.fromEntries(rows.map((r) => [r.key, r.value]));
    return reply.send({ settings });
  });
}
