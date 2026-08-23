import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../../db.js';
import { audit } from '../../lib/audit.js';
import { sendMail } from '../../lib/mailer.js';
import { formatCOP } from '../../lib/money.js';
import { env } from '../../env.js';

/** Sustituye {{variables}} de la plantilla por los datos reales de la orden. */
function renderContract(body: string, vars: Record<string, string>): string {
  return body.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? `{{${key}}}`);
}

export default async function orderRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.requireAuth);

  // ─── Listado según el rol ───────────────────────────────────
  app.get('/', async (req, reply) => {
    const scope =
      req.user!.role === 'CLIENT'
        ? { clientId: req.user!.id }
        : req.user!.role === 'PHOTOGRAPHER'
          ? { photographer: { userId: req.user!.id } }
          : {};

    const orders = await prisma.order.findMany({
      where: scope,
      orderBy: { createdAt: 'desc' },
      take: 100,
      select: {
        id: true,
        code: true,
        status: true,
        eventDate: true,
        amountCents: true,
        commissionCents: true,
        photographerCents: true,
        createdAt: true,
        client: { select: { fullName: true } },
        photographer: { select: { slug: true, user: { select: { fullName: true } } } },
        contract: { select: { acceptedAt: true } },
        package: { select: { tier: true, name: true } },
        slot: { select: { turn: true, status: true } },
        zone: { select: { name: true } },
        specialty: { select: { name: true } },
      },
    });

    return reply.send({ orders });
  });

  // ─── Detalle ────────────────────────────────────────────────
  app.get('/:id', async (req, reply) => {
    const order = await loadOwned(req.params as { id: string }, req.user!);
    if (!order) return reply.code(404).send({ error: 'no_encontrado' });
    if (order === 'forbidden') return reply.code(403).send({ error: 'sin_permiso' });

    return reply.send({ order });
  });

  // ─── Contrato: se muestra el texto YA RESUELTO ──────────────
  app.get('/:id/contract', async (req, reply) => {
    const order = await loadOwned(req.params as { id: string }, req.user!);
    if (!order) return reply.code(404).send({ error: 'no_encontrado' });
    if (order === 'forbidden') return reply.code(403).send({ error: 'sin_permiso' });

    // Si ya fue aceptado, se devuelve la copia congelada, nunca una nueva
    // renderización: es la única forma de probar qué firmó esa persona.
    if (order.contract) {
      return reply.send({
        contract: {
          version: order.contract.templateVersion,
          body: order.contract.renderedBody,
          accepted: true,
          acceptedAt: order.contract.acceptedAt,
          acceptedByName: order.contract.acceptedByName,
        },
      });
    }

    const template = await prisma.contractTemplate.findFirst({
      orderBy: { version: 'desc' },
    });
    if (!template) {
      return reply.code(500).send({ error: 'sin_plantilla', message: 'No hay plantilla de contrato configurada.' });
    }

    const body = renderContract(template.bodyMd, {
      fotografo: order.photographer.user.fullName,
      cliente: order.client.fullName,
      fecha: order.eventDate.toISOString().slice(0, 10),
      lugar: order.zone.name,
      paquete: order.package.name,
      valor: formatCOP(order.amountCents),
      dias_entrega: String(order.package.deliveryDays),
      max_fotos: String(order.maxSelectablePhotos || 'las acordadas'),
      fecha_aceptacion: '—',
    });

    return reply.send({
      contract: { version: template.version, body, accepted: false },
    });
  });

  // ─── Aceptación del contrato: evidencia inmutable ───────────
  app.post('/:id/contract/accept', {
    preHandler: [app.requireVerified, app.requireRole('CLIENT')],
  }, async (req, reply) => {
    const parsed = z
      .object({
        fullName: z.string().min(3, 'Escribe tu nombre completo').max(120).trim(),
        accept: z.literal(true, { errorMap: () => ({ message: 'Debes aceptar el contrato' }) }),
      })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'datos_invalidos', issues: parsed.error.issues });
    }

    const order = await loadOwned(req.params as { id: string }, req.user!);
    if (!order) return reply.code(404).send({ error: 'no_encontrado' });
    if (order === 'forbidden') return reply.code(403).send({ error: 'sin_permiso' });
    if (order.clientId !== req.user!.id) return reply.code(403).send({ error: 'sin_permiso' });

    if (order.contract) {
      return reply.code(409).send({
        error: 'ya_aceptado',
        message: 'Este contrato ya fue aceptado.',
      });
    }
    if (order.status !== 'BORRADOR') {
      return reply.code(409).send({ error: 'estado_invalido' });
    }

    const template = await prisma.contractTemplate.findFirst({ orderBy: { version: 'desc' } });
    if (!template) return reply.code(500).send({ error: 'sin_plantilla' });

    const acceptedAt = new Date();
    const renderedBody = renderContract(template.bodyMd, {
      fotografo: order.photographer.user.fullName,
      cliente: order.client.fullName,
      fecha: order.eventDate.toISOString().slice(0, 10),
      lugar: order.zone.name,
      paquete: order.package.name,
      valor: formatCOP(order.amountCents),
      dias_entrega: String(order.package.deliveryDays),
      max_fotos: String(order.maxSelectablePhotos || 'las acordadas'),
      fecha_aceptacion: acceptedAt.toISOString(),
    });

    await prisma.$transaction(async (tx) => {
      await tx.contractAcceptance.create({
        data: {
          orderId: order.id,
          templateVersion: template.version,
          renderedBody, // el texto EXACTO que vio; nunca se actualiza
          acceptedByName: parsed.data.fullName,
          acceptedAt,
          ip: req.ip,
          userAgent: req.headers['user-agent'] ?? 'desconocido',
        },
      });

      await tx.order.update({
        where: { id: order.id },
        data: { status: 'CONTRATO_ACEPTADO' },
      });

      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'CLIENT',
          action: 'contract.accepted',
          entityType: 'Order',
          entityId: order.id,
          before: { status: 'BORRADOR' },
          after: {
            status: 'CONTRATO_ACEPTADO',
            templateVersion: template.version,
            acceptedByName: parsed.data.fullName,
          },
          ip: req.ip,
        },
        tx,
      );
    });

    for (const person of [order.client, order.photographer.user]) {
      await sendMail({
        template: 'contract-accepted',
        to: person.email,
        data: {
          name: person.fullName,
          orderCode: order.code,
          url: `${env.WEB_URL}/ordenes/${order.id}`,
        },
      });
    }

    // El pago llega en la Fase 5; por ahora la orden queda lista para cobrar.
    await prisma.order.update({
      where: { id: order.id },
      data: { status: 'PAGO_PENDIENTE' },
    });

    return reply.send({ ok: true, nextStatus: 'PAGO_PENDIENTE' });
  });
}

// ─── Carga con verificación de propiedad por recurso ──────────
type OwnedOrder = NonNullable<Awaited<ReturnType<typeof fetchOrder>>>;

async function fetchOrder(id: string) {
  return prisma.order.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, fullName: true, email: true } },
      photographer: {
        select: { id: true, slug: true, userId: true, user: { select: { fullName: true, email: true } } },
      },
      contract: true,
      package: {
        select: {
          tier: true,
          name: true,
          description: true,
          includes: true,
          hours: true,
          deliveryDays: true,
          maxSelectablePhotos: true,
        },
      },
      slot: { select: { id: true, date: true, turn: true, status: true, holdExpiresAt: true } },
      zone: { select: { name: true } },
      specialty: { select: { name: true } },
      payments: {
        orderBy: { createdAt: 'desc' },
        select: { id: true, status: true, amountCents: true, reference: true, createdAt: true },
      },
    },
  });
}

async function loadOwned(
  params: { id: string },
  user: { id: string; role: string },
): Promise<OwnedOrder | 'forbidden' | null> {
  const order = await fetchOrder(params.id);
  if (!order) return null;

  const isOwner = order.clientId === user.id || order.photographer.userId === user.id;
  if (!isOwner && user.role !== 'ADMIN') return 'forbidden';

  return order;
}
