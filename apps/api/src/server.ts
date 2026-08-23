import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';

import { env, assertWompiEnvironmentCoherence } from './env.js';
import { prisma } from './db.js';
import authPlugin from './plugins/auth.js';

import authRoutes from './modules/auth/routes.js';
import catalogRoutes from './modules/catalog/routes.js';
import photographerRoutes from './modules/photographers/routes.js';
import slotRoutes from './modules/slots/routes.js';
import bookingRoutes from './modules/bookings/routes.js';
import orderRoutes from './modules/orders/routes.js';
import adminRoutes from './modules/admin/routes.js';

const app = Fastify({
  logger:
    env.NODE_ENV === 'development'
      ? { transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } }
      : true,
  trustProxy: true,
  bodyLimit: 2 * 1024 * 1024,
});

async function main(): Promise<void> {
  // Falla temprano si el ambiente y las llaves de Wompi no coinciden.
  assertWompiEnvironmentCoherence();

  await app.register(helmet, { contentSecurityPolicy: false });
  await app.register(cors, {
    origin: [env.WEB_URL],
    credentials: true,
  });
  await app.register(cookie, { secret: env.COOKIE_SECRET });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });

  await app.register(authPlugin);

  // ─── Salud ────────────────────────────────────────────────
  app.get('/health', async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: 'ok', service: 'eterclack-api', db: 'ok' });
    } catch {
      return reply.code(503).send({ status: 'degraded', db: 'error' });
    }
  });

  // ─── Rutas ────────────────────────────────────────────────
  await app.register(authRoutes, { prefix: '/api/auth' });
  await app.register(catalogRoutes, { prefix: '/api/catalog' });
  await app.register(photographerRoutes, { prefix: '/api/photographers' });
  await app.register(slotRoutes, { prefix: '/api/photographers' });
  await app.register(bookingRoutes, { prefix: '/api/bookings' });
  await app.register(orderRoutes, { prefix: '/api/orders' });
  await app.register(adminRoutes, { prefix: '/api/admin' });

  app.setNotFoundHandler((req, reply) => {
    reply.code(404).send({ error: 'ruta_no_encontrada', path: req.url });
  });

  app.setErrorHandler((error: FastifyError, req, reply) => {
    req.log.error(error);
    const status = error.statusCode ?? 500;
    reply.code(status).send({
      // Un 500 nunca filtra el mensaje interno al cliente.
      error: status === 500 ? 'error_interno' : (error.code ?? 'error'),
      message: status === 500 ? 'Algo salió mal. Intenta de nuevo.' : error.message,
    });
  });

  await app.listen({ port: env.PORT, host: '0.0.0.0' });
  app.log.info(`EterClack API lista en :${env.PORT} (${env.NODE_ENV})`);
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.on(signal, async () => {
    app.log.info(`${signal} recibido, cerrando…`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
}

main().catch((error) => {
  app.log.error(error);
  process.exit(1);
});
