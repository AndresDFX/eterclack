import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { SignJWT, jwtVerify } from 'jose';
import type { Role } from '@prisma/client';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { generateToken, sha256 } from '../lib/crypto.js';

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);

export type AuthUser = {
  id: string;
  email: string;
  role: Role;
  fullName: string;
  emailVerified: boolean;
};

declare module 'fastify' {
  interface FastifyRequest {
    user: AuthUser | null;
  }
  interface FastifyInstance {
    requireAuth: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireRole: (
      ...roles: Role[]
    ) => (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
    requireVerified: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const ACCESS_COOKIE = 'ec_access';
const REFRESH_COOKIE = 'ec_refresh';

const cookieBase = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: env.NODE_ENV === 'production',
  path: '/',
};

export async function signAccessToken(user: AuthUser): Promise<string> {
  return new SignJWT({ email: user.email, role: user.role, fullName: user.fullName })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(env.JWT_ACCESS_TTL)
    .sign(accessSecret);
}

/** Crea sesión: access token en cookie + refresh opaco persistido y revocable. */
export async function issueSession(
  reply: FastifyReply,
  user: AuthUser,
  meta: { ip?: string; userAgent?: string },
): Promise<void> {
  const access = await signAccessToken(user);
  const { token: refresh, hash } = generateToken();

  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await prisma.session.create({
    data: {
      userId: user.id,
      refreshHash: hash,
      ip: meta.ip ?? null,
      userAgent: meta.userAgent ?? null,
      expiresAt,
    },
  });

  reply.setCookie(ACCESS_COOKIE, access, { ...cookieBase, maxAge: 15 * 60 });
  reply.setCookie(REFRESH_COOKIE, refresh, { ...cookieBase, maxAge: 30 * 24 * 60 * 60 });
}

export async function revokeSession(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const refresh = req.cookies[REFRESH_COOKIE];
  if (refresh) {
    await prisma.session.updateMany({
      where: { refreshHash: sha256(refresh), revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  reply.clearCookie(ACCESS_COOKIE, cookieBase);
  reply.clearCookie(REFRESH_COOKIE, cookieBase);
}

/** Rota el refresh token: el anterior queda revocado en el mismo movimiento. */
export async function rotateSession(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<AuthUser | null> {
  const refresh = req.cookies[REFRESH_COOKIE];
  if (!refresh) return null;

  const session = await prisma.session.findUnique({
    where: { refreshHash: sha256(refresh) },
    include: { user: true },
  });

  if (!session || session.revokedAt || session.expiresAt < new Date()) return null;
  if (session.user.status !== 'ACTIVE') return null;

  await prisma.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  const user: AuthUser = {
    id: session.user.id,
    email: session.user.email,
    role: session.user.role,
    fullName: session.user.fullName,
    emailVerified: session.user.emailVerifiedAt !== null,
  };

  await issueSession(reply, user, {
    ip: req.ip,
    userAgent: req.headers['user-agent'],
  });

  return user;
}

async function authPlugin(app: FastifyInstance): Promise<void> {
  // Resuelve el usuario en cada petición; no bloquea si no hay sesión.
  app.decorateRequest('user', null);

  app.addHook('onRequest', async (req) => {
    const token = req.cookies[ACCESS_COOKIE];
    if (!token) return;

    try {
      const { payload } = await jwtVerify(token, accessSecret);
      const user = await prisma.user.findUnique({ where: { id: payload.sub! } });
      if (!user || user.status !== 'ACTIVE' || user.deletedAt) return;

      req.user = {
        id: user.id,
        email: user.email,
        role: user.role,
        fullName: user.fullName,
        emailVerified: user.emailVerifiedAt !== null,
      };
    } catch {
      // Token vencido o inválido: la petición sigue como anónima.
    }
  });

  app.decorate('requireAuth', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      return reply.code(401).send({ error: 'no_autenticado', message: 'Inicia sesión para continuar.' });
    }
  });

  app.decorate('requireVerified', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!req.user) {
      return reply.code(401).send({ error: 'no_autenticado', message: 'Inicia sesión para continuar.' });
    }
    if (!req.user.emailVerified) {
      return reply
        .code(403)
        .send({ error: 'correo_no_verificado', message: 'Confirma tu correo para continuar.' });
    }
  });

  app.decorate(
    'requireRole',
    (...roles: Role[]) =>
      async (req: FastifyRequest, reply: FastifyReply) => {
        if (!req.user) {
          return reply.code(401).send({ error: 'no_autenticado', message: 'Inicia sesión para continuar.' });
        }
        if (!roles.includes(req.user.role)) {
          return reply.code(403).send({ error: 'sin_permiso', message: 'No tienes permiso para esta acción.' });
        }
      },
  );
}

export default fp(authPlugin, { name: 'auth' });
