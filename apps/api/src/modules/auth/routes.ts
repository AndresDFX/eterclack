import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { env } from '../../env.js';
import { prisma } from '../../db.js';
import { hashPassword, verifyPassword, generateToken, sha256 } from '../../lib/crypto.js';
import { issueSession, revokeSession, rotateSession, type AuthUser } from '../../plugins/auth.js';
import { sendMail } from '../../lib/mailer.js';
import { audit } from '../../lib/audit.js';
import { uniqueSlug } from '../../lib/slug.js';

const passwordSchema = z
  .string()
  .min(8, 'La contraseña debe tener al menos 8 caracteres')
  .max(200);

const registerSchema = z.object({
  email: z.string().email('Correo inválido').toLowerCase().trim(),
  password: passwordSchema,
  fullName: z.string().min(3, 'Escribe tu nombre completo').max(120).trim(),
  phone: z.string().max(30).trim().optional(),
  role: z.enum(['CLIENT', 'PHOTOGRAPHER']),
  acceptTerms: z.literal(true, {
    errorMap: () => ({ message: 'Debes aceptar los términos' }),
  }),
});

const loginSchema = z.object({
  email: z.string().email().toLowerCase().trim(),
  password: z.string().min(1),
});

function toAuthUser(u: {
  id: string;
  email: string;
  role: AuthUser['role'];
  fullName: string;
  emailVerifiedAt: Date | null;
}): AuthUser {
  return {
    id: u.id,
    email: u.email,
    role: u.role,
    fullName: u.fullName,
    emailVerified: u.emailVerifiedAt !== null,
  };
}

export default async function authRoutes(app: FastifyInstance): Promise<void> {
  // ─── Registro ───────────────────────────────────────────────
  app.post('/register', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'datos_invalidos', issues: parsed.error.issues });
    }
    const { email, password, fullName, phone, role } = parsed.data;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      // No se revela si el correo existe: mismo mensaje que un registro válido.
      return reply.code(409).send({
        error: 'correo_en_uso',
        message: 'Ese correo ya tiene una cuenta. Inicia sesión o recupera tu contraseña.',
      });
    }

    const passwordHash = await hashPassword(password);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          email,
          passwordHash,
          fullName,
          phone: phone ?? null,
          role,
          consentAcceptedAt: new Date(),
        },
      });

      // Un fotógrafo nace con perfil en PENDING: no aparece en búsquedas.
      if (role === 'PHOTOGRAPHER') {
        const slug = await uniqueSlug(fullName, async (s) =>
          (await tx.photographerProfile.count({ where: { slug: s } })) > 0,
        );
        await tx.photographerProfile.create({
          data: { userId: created.id, slug, status: 'PENDING' },
        });
      }

      await audit(
        {
          actorId: created.id,
          actorRole: role,
          action: 'user.registered',
          entityType: 'User',
          entityId: created.id,
          after: { email, role },
          ip: req.ip,
        },
        tx,
      );

      return created;
    });

    // Token de verificación de correo (24 h)
    const { token, hash } = generateToken();
    await prisma.verificationToken.create({
      data: {
        userId: user.id,
        tokenHash: hash,
        purpose: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await sendMail({
      template: 'verify-email',
      to: email,
      priority: 1,
      data: { name: fullName, url: `${env.WEB_URL}/verificar?token=${token}` },
    });

    if (role === 'PHOTOGRAPHER') {
      await sendMail({
        template: 'photographer-application-received',
        to: email,
        data: { name: fullName },
      });
    }

    const authUser = toAuthUser(user);
    await issueSession(reply, authUser, { ip: req.ip, userAgent: req.headers['user-agent'] });

    return reply.code(201).send({ user: authUser });
  });

  // ─── Inicio de sesión ───────────────────────────────────────
  app.post('/login', {
    config: { rateLimit: { max: 10, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'datos_invalidos', issues: parsed.error.issues });
    }

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

    // Mismo mensaje y coste similar exista o no el usuario.
    const ok = user ? await verifyPassword(parsed.data.password, user.passwordHash) : false;
    if (!user || !ok || user.deletedAt) {
      return reply.code(401).send({
        error: 'credenciales_invalidas',
        message: 'Correo o contraseña incorrectos.',
      });
    }
    if (user.status === 'SUSPENDED') {
      return reply.code(403).send({
        error: 'cuenta_suspendida',
        message: 'Tu cuenta está suspendida. Escríbenos a hola@eterclack.com.',
      });
    }

    const authUser = toAuthUser(user);
    await issueSession(reply, authUser, { ip: req.ip, userAgent: req.headers['user-agent'] });
    return reply.send({ user: authUser });
  });

  // ─── Sesión actual ──────────────────────────────────────────
  app.get('/me', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ user: null });

    const profile =
      req.user.role === 'PHOTOGRAPHER'
        ? await prisma.photographerProfile.findUnique({
            where: { userId: req.user.id },
            select: { id: true, slug: true, status: true },
          })
        : null;

    return reply.send({ user: req.user, photographer: profile });
  });

  // ─── Renovar sesión ─────────────────────────────────────────
  app.post('/refresh', async (req, reply) => {
    const user = await rotateSession(req, reply);
    if (!user) {
      return reply.code(401).send({ error: 'sesion_invalida', message: 'Vuelve a iniciar sesión.' });
    }
    return reply.send({ user });
  });

  // ─── Cerrar sesión ──────────────────────────────────────────
  app.post('/logout', async (req, reply) => {
    await revokeSession(req, reply);
    return reply.send({ ok: true });
  });

  // ─── Verificación de correo ─────────────────────────────────
  app.post('/verify-email', async (req, reply) => {
    const parsed = z.object({ token: z.string().min(10) }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'token_invalido' });

    const record = await prisma.verificationToken.findUnique({
      where: { tokenHash: sha256(parsed.data.token) },
      include: { user: true },
    });

    if (
      !record ||
      record.purpose !== 'EMAIL_VERIFICATION' ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      return reply.code(400).send({
        error: 'token_invalido',
        message: 'El enlace no es válido o ya venció. Solicita uno nuevo.',
      });
    }

    await prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      });
      await tx.user.update({
        where: { id: record.userId },
        data: { emailVerifiedAt: new Date() },
      });
      await audit(
        {
          actorId: record.userId,
          action: 'user.email_verified',
          entityType: 'User',
          entityId: record.userId,
          ip: req.ip,
        },
        tx,
      );
    });

    if (record.user.role === 'CLIENT') {
      await sendMail({
        template: 'welcome-client',
        to: record.user.email,
        data: { name: record.user.fullName },
      });
    }

    return reply.send({ ok: true });
  });

  // ─── Reenviar verificación ──────────────────────────────────
  app.post('/resend-verification', {
    config: { rateLimit: { max: 3, timeWindow: '15 minutes' } },
    preHandler: [app.requireAuth],
  }, async (req, reply) => {
    if (req.user!.emailVerified) return reply.send({ ok: true });

    const { token, hash } = generateToken();
    await prisma.verificationToken.create({
      data: {
        userId: req.user!.id,
        tokenHash: hash,
        purpose: 'EMAIL_VERIFICATION',
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      },
    });

    await sendMail({
      template: 'verify-email',
      to: req.user!.email,
      priority: 1,
      data: { name: req.user!.fullName, url: `${env.WEB_URL}/verificar?token=${token}` },
    });

    return reply.send({ ok: true });
  });

  // ─── Recuperación de contraseña ─────────────────────────────
  app.post('/forgot-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parsed = z.object({ email: z.string().email().toLowerCase().trim() }).safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: 'datos_invalidos' });

    const user = await prisma.user.findUnique({ where: { email: parsed.data.email } });

    // Respuesta idéntica exista o no la cuenta: no se filtra qué correos están registrados.
    if (user && user.status === 'ACTIVE' && !user.deletedAt) {
      const { token, hash } = generateToken();
      await prisma.verificationToken.create({
        data: {
          userId: user.id,
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
    }

    return reply.send({ ok: true });
  });

  app.post('/reset-password', {
    config: { rateLimit: { max: 5, timeWindow: '15 minutes' } },
  }, async (req, reply) => {
    const parsed = z
      .object({ token: z.string().min(10), password: passwordSchema })
      .safeParse(req.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: 'datos_invalidos', issues: parsed.error.issues });
    }

    const record = await prisma.verificationToken.findUnique({
      where: { tokenHash: sha256(parsed.data.token) },
    });

    if (
      !record ||
      record.purpose !== 'PASSWORD_RESET' ||
      record.usedAt ||
      record.expiresAt < new Date()
    ) {
      return reply.code(400).send({
        error: 'token_invalido',
        message: 'El enlace no es válido o ya venció. Solicita uno nuevo.',
      });
    }

    const passwordHash = await hashPassword(parsed.data.password);

    await prisma.$transaction(async (tx) => {
      await tx.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } });
      await tx.user.update({ where: { id: record.userId }, data: { passwordHash } });
      // Cambiar la contraseña revoca todas las sesiones abiertas.
      await tx.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await audit(
        {
          actorId: record.userId,
          action: 'user.password_reset',
          entityType: 'User',
          entityId: record.userId,
          ip: req.ip,
        },
        tx,
      );
    });

    return reply.send({ ok: true });
  });
}
