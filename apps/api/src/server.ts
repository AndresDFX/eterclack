import Fastify, { type FastifyError } from 'fastify';
import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

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
import userRoutes from './modules/users/routes.js';

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
  // Con SERVE_WEB no hay petición de origen cruzado, así que CORS sobra.
  // Solo se habilita cuando el frontend vive en otro dominio.
  if (!env.SERVE_WEB) {
    await app.register(cors, { origin: [env.WEB_URL], credentials: true });
  }
  await app.register(cookie, { secret: env.COOKIE_SECRET });
  await app.register(rateLimit, {
    global: true,
    max: 300,
    timeWindow: '1 minute',
    keyGenerator: (req) => req.ip,
  });

  await app.register(authPlugin);

  // ─── Salud ────────────────────────────────────────────────
  // Vitalidad: responde 200 siempre que el proceso esté vivo. NO consulta la
  // base a propósito. Es el que vigila el proveedor: si devolviera 503 por una
  // caída pasajera de Postgres, se cancelaría el despliegue o se reiniciaría la
  // instancia, tumbando también el frontend, que se sirve perfectamente sin base.
  app.get('/health', { config: { rateLimit: false } }, async (_req, reply) => {
    return reply.send({ status: 'ok', service: 'eterclack-api' });
  });

  // Disponibilidad real: este sí toca la base. Para monitoreo y diagnóstico,
  // no para que el proveedor decida si mata el servicio.
  app.get('/health/db', { config: { rateLimit: false } }, async (_req, reply) => {
    try {
      await prisma.$queryRaw`SELECT 1`;
      return reply.send({ status: 'ok', db: 'ok' });
    } catch (error) {
      return reply.code(503).send({
        status: 'degraded',
        db: 'error',
        detalle: error instanceof Error ? error.message : 'desconocido',
      });
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
  await app.register(userRoutes, { prefix: '/api/admin/users' });

  // ─── Frontend ─────────────────────────────────────────────
  // Servir la SPA desde la misma API mantiene un único origen: la cookie de
  // sesión sigue siendo SameSite=Lax y no hace falta CORS.
  // Se ancla al directorio de trabajo (apps/api), no al del módulo: en
  // desarrollo el código vive en src/ y compilado en dist/src/, así que
  // una ruta relativa al módulo apunta a sitios distintos en cada caso.
  const webDist = resolve(process.cwd(), env.WEB_DIST_PATH);
  const sirviendoWeb = env.SERVE_WEB && existsSync(webDist);

  if (env.SERVE_WEB && !sirviendoWeb) {
    app.log.warn(`SERVE_WEB activo pero no existe ${webDist}. Se sirve solo la API.`);
  }

  if (sirviendoWeb) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: '/',
      // El Cache-Control propio del plugin pisaría el de setHeaders.
      cacheControl: false,
      // Los assets llevan hash en el nombre: son inmutables.
      setHeaders(res, path) {
        if (path.includes('/assets/')) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        } else if (path.endsWith('sw.js') || path.endsWith('index.html')) {
          // El service worker y el HTML nunca se cachean: si no, la app
          // queda congelada en una versión vieja tras un despliegue.
          res.setHeader('Cache-Control', 'no-cache, must-revalidate');
        } else {
          res.setHeader('Cache-Control', 'public, max-age=3600');
        }
      },
    });
    app.log.info(`Sirviendo el frontend desde ${webDist}`);
  }

  app.setNotFoundHandler((req, reply) => {
    // Las rutas de API que no existen son 404 de verdad.
    if (req.url.startsWith('/api/') || req.url.startsWith('/health')) {
      return reply.code(404).send({ error: 'ruta_no_encontrada', path: req.url });
    }
    // Cualquier otra ruta la resuelve el enrutador del cliente.
    if (sirviendoWeb) {
      return reply.type('text/html').sendFile('index.html');
    }
    return reply.code(404).send({ error: 'ruta_no_encontrada', path: req.url });
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

  // El sembrado va DESPUÉS de escuchar y sin await: descargar los portafolios
  // puede tardar minutos, y un proveedor que no ve el puerto abierto a tiempo
  // cancela el despliegue.
  if (env.SEED_ON_START) {
    void import('../prisma/sembrar-si-vacia.js')
      .then(({ sembrarSiVacia }) => sembrarSiVacia(app.log))
      .catch((error) => app.log.error(`No se pudo cargar la semilla: ${error}`));
  }
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
