import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { Prisma, Role } from '@prisma/client';
import { prisma } from '../../db.js';
import { hashPassword, generateToken } from '../../lib/crypto.js';
import { audit } from '../../lib/audit.js';
import { sendMail } from '../../lib/mailer.js';
import { uniqueSlug } from '../../lib/slug.js';
import { env } from '../../env.js';

/**
 * Administración de usuarios.
 *
 * Permite crear cualquier rol —incluido otro administrador— y por eso el
 * módulo entero exige rol ADMIN. Las reglas que importan no son las del CRUD
 * sino las que impiden dejar la plataforma sin quién la administre, o borrar
 * usuarios que sostienen reservas.
 */

const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(200);

const roleSchema = z.enum(['CLIENT', 'PHOTOGRAPHER', 'ADMIN']);
const statusSchema = z.enum(['ACTIVE', 'SUSPENDED', 'DELETED']);

const createSchema = z.object({
  email: z.string().email('Correo inválido').toLowerCase().trim(),
  fullName: z.string().min(3, 'Escribe el nombre completo').max(120).trim(),
  phone: z.string().max(30).trim().optional(),
  role: roleSchema,
  password: passwordSchema,
  /** Un usuario creado por administración ya viene avalado: se da por verificado. */
  emailVerified: z.boolean().default(true),
  /** Aviso de bienvenida. Sin correo configurado simplemente no sale. */
  notify: z.boolean().default(false),
});

const updateSchema = z.object({
  email: z.string().email('Correo inválido').toLowerCase().trim().optional(),
  fullName: z.string().min(3).max(120).trim().optional(),
  phone: z.string().max(30).trim().nullable().optional(),
  role: roleSchema.optional(),
  status: statusSchema.optional(),
  emailVerified: z.boolean().optional(),
});

const listSchema = z.object({
  role: roleSchema.optional(),
  status: statusSchema.optional(),
  q: z.string().trim().max(120).optional(),
  incluirBorrados: z.coerce.boolean().default(false),
  page: z.coerce.number().int().min(1).default(1),
  perPage: z.coerce.number().int().min(1).max(100).default(20),
});

const SELECT = {
  id: true,
  email: true,
  fullName: true,
  phone: true,
  role: true,
  status: true,
  emailVerifiedAt: true,
  createdAt: true,
  updatedAt: true,
  deletedAt: true,
  photographer: { select: { id: true, slug: true, status: true } },
  _count: { select: { clientOrders: true, sessions: true } },
} satisfies Prisma.UserSelect;

/** Un fotógrafo sin perfil no puede entrar a su panel: se crea siempre junto al usuario. */
async function crearPerfilFotografo(
  tx: Prisma.TransactionClient,
  userId: string,
  fullName: string,
): Promise<void> {
  const yaTiene = await tx.photographerProfile.findUnique({ where: { userId } });
  if (yaTiene) return;

  const slug = await uniqueSlug(
    fullName,
    async (s) => (await tx.photographerProfile.count({ where: { slug: s } })) > 0,
  );
  await tx.photographerProfile.create({ data: { userId, slug, status: 'PENDING' } });
}

export default async function userRoutes(app: FastifyInstance): Promise<void> {
  app.addHook('preHandler', app.requireRole('ADMIN'));

  // ─── Listado ────────────────────────────────────────────────
  app.get('/', async (req, reply) => {
    const parsed = listSchema.safeParse(req.query);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'filtros_invalidos', issues: parsed.error.issues });
    }
    const { role, status, q, incluirBorrados, page, perPage } = parsed.data;

    const where: Prisma.UserWhereInput = {
      ...(role ? { role } : {}),
      ...(status ? { status } : {}),
      ...(incluirBorrados ? {} : { deletedAt: null }),
      ...(q
        ? {
            OR: [
              { fullName: { contains: q, mode: 'insensitive' } },
              { email: { contains: q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [total, users, porRol] = await Promise.all([
      prisma.user.count({ where }),
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * perPage,
        take: perPage,
        select: SELECT,
      }),
      prisma.user.groupBy({
        by: ['role'],
        where: { deletedAt: null },
        _count: true,
      }),
    ]);

    return reply.send({
      total,
      page,
      perPage,
      pages: Math.ceil(total / perPage),
      users,
      resumen: Object.fromEntries(porRol.map((r) => [r.role, r._count])),
    });
  });

  // ─── Detalle ────────────────────────────────────────────────
  app.get('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id }, select: SELECT });
    if (!user) return reply.code(404).send({ error: 'no_encontrado' });
    return reply.send({ user });
  });

  // ─── Crear ──────────────────────────────────────────────────
  app.post('/', async (req, reply) => {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'datos_invalidos', issues: parsed.error.issues });
    }
    const { email, fullName, phone, role, password, emailVerified, notify } = parsed.data;

    const existente = await prisma.user.findUnique({ where: { email } });
    if (existente) {
      // Distinguir el caso borrado es útil: la acción correcta es restaurar,
      // no inventar otro correo.
      return reply.code(409).send({
        error: existente.deletedAt ? 'correo_de_usuario_borrado' : 'correo_en_uso',
        message: existente.deletedAt
          ? 'Ese correo pertenece a un usuario borrado. Restáuralo en vez de crear otro.'
          : 'Ese correo ya tiene una cuenta.',
        userId: existente.id,
      });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      const creado = await tx.user.create({
        data: {
          email,
          fullName,
          phone: phone ?? null,
          role,
          passwordHash,
          emailVerifiedAt: emailVerified ? new Date() : null,
          consentAcceptedAt: new Date(),
        },
        select: SELECT,
      });

      if (role === 'PHOTOGRAPHER') {
        await crearPerfilFotografo(tx, creado.id, fullName);
      }

      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'ADMIN',
          action: 'user.created_by_admin',
          entityType: 'User',
          entityId: creado.id,
          after: { email, role, emailVerified },
          ip: req.ip,
        },
        tx,
      );

      return creado;
    });

    if (notify) {
      await sendMail({
        template: 'account-created',
        to: email,
        priority: 1,
        data: { name: fullName, email, role, url: `${env.WEB_URL}/ingresar` },
      });
    }

    // Se relee para incluir el perfil recién creado.
    const completo = await prisma.user.findUnique({ where: { id: user.id }, select: SELECT });
    return reply.code(201).send({ user: completo });
  });

  // ─── Actualizar ─────────────────────────────────────────────
  app.patch('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'datos_invalidos', issues: parsed.error.issues });
    }
    const cambios = parsed.data;

    const actual = await prisma.user.findUnique({
      where: { id },
      include: { photographer: true, _count: { select: { clientOrders: true } } },
    });
    if (!actual) return reply.code(404).send({ error: 'no_encontrado' });

    // ── Guardas ───────────────────────────────────────────────
    const esYoMismo = actual.id === req.user!.id;

    if (esYoMismo && cambios.role && cambios.role !== actual.role) {
      return reply.code(409).send({
        error: 'auto_cambio_de_rol',
        message: 'No puedes quitarte a ti mismo el rol de administrador.',
      });
    }
    if (esYoMismo && cambios.status && cambios.status !== 'ACTIVE') {
      return reply.code(409).send({
        error: 'auto_suspension',
        message: 'No puedes suspender ni borrar tu propia cuenta.',
      });
    }

    // Dejar la plataforma sin ningún administrador activo la vuelve inadministrable.
    const dejaDeSerAdmin =
      actual.role === 'ADMIN' &&
      ((cambios.role && cambios.role !== 'ADMIN') || (cambios.status && cambios.status !== 'ACTIVE'));

    if (dejaDeSerAdmin) {
      const otrosAdmins = await prisma.user.count({
        where: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null, id: { not: id } },
      });
      if (otrosAdmins === 0) {
        return reply.code(409).send({
          error: 'ultimo_administrador',
          message: 'Es el único administrador activo. Crea otro antes de cambiarlo.',
        });
      }
    }

    // Un fotógrafo con reservas no puede dejar de serlo: sus órdenes quedarían huérfanas.
    if (
      cambios.role &&
      cambios.role !== 'PHOTOGRAPHER' &&
      actual.role === 'PHOTOGRAPHER' &&
      actual.photographer
    ) {
      const reservas = await prisma.order.count({
        where: { photographerId: actual.photographer.id },
      });
      if (reservas > 0) {
        return reply.code(409).send({
          error: 'fotografo_con_reservas',
          message: `Tiene ${reservas} reserva(s). Suspéndelo en vez de cambiarle el rol.`,
        });
      }
    }

    if (cambios.email && cambios.email !== actual.email) {
      const ocupado = await prisma.user.findUnique({ where: { email: cambios.email } });
      if (ocupado) {
        return reply.code(409).send({ error: 'correo_en_uso', message: 'Ese correo ya está usado.' });
      }
    }

    const actualizado = await prisma.$transaction(async (tx) => {
      const data: Prisma.UserUpdateInput = {};
      if (cambios.email !== undefined) data.email = cambios.email;
      if (cambios.fullName !== undefined) data.fullName = cambios.fullName;
      if (cambios.phone !== undefined) data.phone = cambios.phone;
      if (cambios.role !== undefined) data.role = cambios.role;
      if (cambios.emailVerified !== undefined) {
        data.emailVerifiedAt = cambios.emailVerified ? new Date() : null;
      }
      if (cambios.status !== undefined) {
        data.status = cambios.status;
        data.deletedAt = cambios.status === 'DELETED' ? new Date() : null;
      }

      const u = await tx.user.update({ where: { id }, data, select: SELECT });

      // Pasar a fotógrafo exige perfil; sin él, su panel no carga.
      if (cambios.role === 'PHOTOGRAPHER') {
        await crearPerfilFotografo(tx, id, u.fullName);
      }

      // Suspender o borrar corta el acceso de inmediato: sin esto seguiría
      // navegando con la sesión que ya tenía abierta.
      if (cambios.status && cambios.status !== 'ACTIVE') {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'ADMIN',
          action: 'user.updated_by_admin',
          entityType: 'User',
          entityId: id,
          before: { role: actual.role, status: actual.status, email: actual.email },
          after: cambios,
          ip: req.ip,
        },
        tx,
      );

      return u;
    });

    return reply.send({ user: actualizado });
  });

  // ─── Cambiar contraseña ─────────────────────────────────────
  app.post('/:id/password', async (req, reply) => {
    const { id } = req.params as { id: string };
    const parsed = z
      .object({ password: passwordSchema, cerrarSesiones: z.boolean().default(true) })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'datos_invalidos', issues: parsed.error.issues });
    }

    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: 'no_encontrado' });

    const passwordHash = await hashPassword(parsed.data.password);

    await prisma.$transaction(async (tx) => {
      await tx.user.update({ where: { id }, data: { passwordHash } });

      if (parsed.data.cerrarSesiones) {
        await tx.session.updateMany({
          where: { userId: id, revokedAt: null },
          data: { revokedAt: new Date() },
        });
      }

      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'ADMIN',
          action: 'user.password_set_by_admin',
          entityType: 'User',
          entityId: id,
          ip: req.ip,
        },
        tx,
      );
    });

    return reply.send({ ok: true });
  });

  // ─── Enviar enlace de recuperación ──────────────────────────
  app.post('/:id/send-reset', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: 'no_encontrado' });

    const { token, hash } = generateToken();
    await prisma.verificationToken.create({
      data: {
        userId: id,
        tokenHash: hash,
        purpose: 'PASSWORD_RESET',
        expiresAt: new Date(Date.now() + 60 * 60 * 1000),
      },
    });

    await sendMail({
      template: 'password-reset',
      to: user.email,
      priority: 1,
      data: { name: user.fullName, url: `${env.WEB_URL}/restablecer?token=${token}` },
    });

    await audit({
      actorId: req.user!.id,
      actorRole: 'ADMIN',
      action: 'user.reset_sent_by_admin',
      entityType: 'User',
      entityId: id,
      ip: req.ip,
    });

    return reply.send({ ok: true });
  });

  // ─── Borrar (lógico) ────────────────────────────────────────
  app.delete('/:id', async (req, reply) => {
    const { id } = req.params as { id: string };

    const user = await prisma.user.findUnique({
      where: { id },
      include: {
        photographer: true,
        _count: { select: { clientOrders: true } },
      },
    });
    if (!user) return reply.code(404).send({ error: 'no_encontrado' });

    if (user.id === req.user!.id) {
      return reply.code(409).send({
        error: 'auto_borrado',
        message: 'No puedes borrar tu propia cuenta.',
      });
    }

    if (user.role === 'ADMIN') {
      const otros = await prisma.user.count({
        where: { role: 'ADMIN', status: 'ACTIVE', deletedAt: null, id: { not: id } },
      });
      if (otros === 0) {
        return reply.code(409).send({
          error: 'ultimo_administrador',
          message: 'Es el único administrador activo. Crea otro antes de borrarlo.',
        });
      }
    }

    if (user.deletedAt) return reply.send({ ok: true, yaEstaba: true });

    await prisma.$transaction(async (tx) => {
      // Borrado lógico: hay órdenes, contratos y auditoría que apuntan aquí.
      // Un borrado real dejaría registros sin dueño y rompería la trazabilidad
      // que sostiene un contrato aceptado.
      await tx.user.update({
        where: { id },
        data: { status: 'DELETED', deletedAt: new Date() },
      });

      await tx.session.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });

      // Un fotógrafo borrado no puede seguir apareciendo en las búsquedas.
      if (user.photographer) {
        await tx.photographerProfile.update({
          where: { id: user.photographer.id },
          data: { status: 'SUSPENDED' },
        });
      }

      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'ADMIN',
          action: 'user.deleted_by_admin',
          entityType: 'User',
          entityId: id,
          before: { email: user.email, role: user.role, status: user.status },
          after: { status: 'DELETED', ordenes: user._count.clientOrders },
          ip: req.ip,
        },
        tx,
      );
    });

    return reply.send({ ok: true });
  });

  // ─── Restaurar ──────────────────────────────────────────────
  app.post('/:id/restore', async (req, reply) => {
    const { id } = req.params as { id: string };
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) return reply.code(404).send({ error: 'no_encontrado' });
    if (!user.deletedAt) return reply.send({ ok: true, yaEstaba: true });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id },
        data: { status: 'ACTIVE', deletedAt: null },
      });
      await audit(
        {
          actorId: req.user!.id,
          actorRole: 'ADMIN',
          action: 'user.restored_by_admin',
          entityType: 'User',
          entityId: id,
          after: { status: 'ACTIVE' },
          ip: req.ip,
        },
        tx,
      );
    });

    // El perfil de fotógrafo queda suspendido a propósito: volver a publicarlo
    // es una decisión aparte, con su propia revisión.
    return reply.send({ ok: true });
  });
}
