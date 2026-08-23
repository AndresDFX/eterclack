import { randomBytes, scrypt, timingSafeEqual, createHash, type ScryptOptions } from 'node:crypto';

// Parámetros alineados con la recomendación de OWASP para scrypt.
const N = 2 ** 16;
const r = 8;
const p = 1;
const KEY_LEN = 64;
const MAXMEM = 256 * 1024 * 1024;

/** promisify pierde la sobrecarga con opciones, así que se envuelve a mano. */
function scryptAsync(
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptOptions,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, keylen, options, (err, derivedKey) => {
      if (err) reject(err);
      else resolve(derivedKey);
    });
  });
}

/**
 * Hash de contraseña con scrypt (memoria dura, sin dependencias nativas).
 * Formato: scrypt$N$r$p$salt$hash
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scryptAsync(password, salt, KEY_LEN, { N, r, p, maxmem: MAXMEM });
  return ['scrypt', N, r, p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;

  const salt = Buffer.from(parts[4]!, 'base64');
  const expected = Buffer.from(parts[5]!, 'base64');

  const key = await scryptAsync(password, salt, expected.length, {
    N: Number(parts[1]),
    r: Number(parts[2]),
    p: Number(parts[3]),
    maxmem: MAXMEM,
  });

  return key.length === expected.length && timingSafeEqual(key, expected);
}

/** Token opaco para verificación de correo y recuperación de contraseña. */
export function generateToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString('base64url');
  return { token, hash: sha256(token) };
}

export function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

/** Comparación en tiempo constante de dos hex. Nunca usar === con checksums. */
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a, 'utf8'), Buffer.from(b, 'utf8'));
}
