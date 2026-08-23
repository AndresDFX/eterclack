/**
 * Siembra la base solo si está vacía.
 *
 * Existe por una limitación concreta: la pestaña Shell de Render es de pago.
 * En el plan gratuito no hay forma de ejecutar un comando dentro del servicio,
 * así que la única manera de poblar la base es hacerlo al arrancar.
 *
 * La comprobación es una cuenta de usuarios: barata, y evita repetir el
 * sembrado (con su descarga de fotos) en cada despertar del servicio, que en
 * el plan gratuito ocurre cada vez que alguien entra tras 15 minutos de calma.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main(): Promise<void> {
  try {
    const usuarios = await prisma.user.count();

    if (usuarios > 0) {
      console.log(`→ La base ya tiene ${usuarios} usuarios. No se siembra.`);
      return;
    }

    console.log('→ Base vacía. Sembrando datos de prueba…');
    await prisma.$disconnect();

    // La semilla abre su propio cliente; se importa después de cerrar este
    // para no dejar dos conexiones abiertas contra el plan gratuito, que las
    // tiene muy limitadas.
    await import('./seed.js');
  } catch (error) {
    // Un fallo aquí no debe impedir que la aplicación arranque: es preferible
    // una plataforma vacía y accesible a un servicio que no levanta.
    console.error('✗ No se pudo sembrar:', error instanceof Error ? error.message : error);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}

await main();
