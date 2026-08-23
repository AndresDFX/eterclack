/**
 * Siembra la base solo si está vacía.
 *
 * Existe por una limitación concreta: Render no ofrece Shell ni SSH en el plan
 * gratuito, así que no hay forma de ejecutar un comando dentro del servicio.
 * La única vía para poblar la base es hacerlo desde el propio proceso.
 *
 * Se ejecuta DESPUÉS de abrir el puerto y sin await: descargar las fotos de
 * los portafolios puede tardar minutos, y Render cancela el despliegue si el
 * proceso no escucha pronto («Port scan timeout reached»). Que la plataforma
 * esté arriba y se vaya llenando es mejor que un despliegue cancelado.
 */

import { PrismaClient } from '@prisma/client';

type Registro = {
  info: (msg: string) => void;
  warn: (msg: string) => void;
  error: (msg: string) => void;
};

export async function sembrarSiVacia(log: Registro): Promise<void> {
  const prisma = new PrismaClient();

  try {
    const usuarios = await prisma.user.count();

    if (usuarios > 0) {
      log.info(`Semilla omitida: la base ya tiene ${usuarios} usuarios.`);
      return;
    }

    log.info('Base vacía: sembrando datos de prueba en segundo plano…');
    await prisma.$disconnect();

    // La semilla abre su propio cliente; se importa después de cerrar este
    // para no sostener dos conexiones contra un plan con pocas disponibles.
    await import('./seed.js');
    log.info('Semilla terminada.');
  } catch (error) {
    // Un fallo aquí no debe afectar al servicio: ya está escuchando.
    log.error(`No se pudo sembrar: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await prisma.$disconnect().catch(() => {});
  }
}
