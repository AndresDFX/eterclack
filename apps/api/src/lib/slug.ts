import { customAlphabet } from 'nanoid';

const nano = customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 6);

// Marcas diacríticas combinantes, para que "María Gómez" → "maria-gomez".
const DIACRITICS = /[̀-ͯ]/g;

export function slugify(value: string): string {
  return value
    .normalize('NFD')
    .replace(DIACRITICS, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/** Slug único: agrega sufijo corto solo si hace falta. */
export async function uniqueSlug(
  base: string,
  exists: (slug: string) => Promise<boolean>,
): Promise<string> {
  const root = slugify(base) || 'perfil';
  if (!(await exists(root))) return root;

  for (let i = 0; i < 5; i++) {
    const candidate = `${root}-${nano()}`;
    if (!(await exists(candidate))) return candidate;
  }
  throw new Error('No se pudo generar un slug único');
}

/** Códigos legibles para el usuario: ETC-2026-000123. */
export function sequentialCode(prefix: string, n: number, year = new Date().getFullYear()): string {
  return `${prefix}-${year}-${String(n).padStart(6, '0')}`;
}
