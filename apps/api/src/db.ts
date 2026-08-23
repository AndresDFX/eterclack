import { PrismaClient } from '@prisma/client';
import { env } from './env.js';

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
});

/**
 * BigInt no es serializable por JSON.stringify. Todo el dinero del sistema es
 * BigInt de centavos, así que sin esto cualquier respuesta con montos revienta.
 */
declare global {
  interface BigInt {
    toJSON(): string;
  }
}
BigInt.prototype.toJSON = function () {
  return this.toString();
};
