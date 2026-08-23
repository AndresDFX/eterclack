import { PutObjectCommand } from '@aws-sdk/client-s3';
import { s3, BUCKETS } from '../src/lib/s3.js';

/**
 * Descarga fotos de muestra y las sube al bucket público de MinIO.
 *
 * Un marketplace de fotografía sin fotos no se puede evaluar: los filtros, las
 * tarjetas y las fichas solo se entienden con imágenes reales. Estas vienen de
 * picsum.photos (libres de derechos) y se guardan en MinIO, así que después del
 * primer sembrado la plataforma funciona sin internet.
 */

const SOURCE = 'https://picsum.photos/seed';

async function download(seed: string, w: number, h: number): Promise<Buffer | null> {
  try {
    const res = await fetch(`${SOURCE}/${seed}/${w}/${h}`, {
      redirect: 'follow',
      signal: AbortSignal.timeout(20_000),
    });
    if (!res.ok) return null;
    return Buffer.from(await res.arrayBuffer());
  } catch {
    return null;
  }
}

let almacenamientoCaido = false;

async function upload(key: string, body: Buffer): Promise<void> {
  if (almacenamientoCaido) throw new Error('almacenamiento no disponible');

  await s3.send(
    new PutObjectCommand({
      Bucket: BUCKETS.public,
      Key: key,
      Body: body,
      ContentType: 'image/jpeg',
      CacheControl: 'public, max-age=31536000, immutable',
    }),
  );
}

export type SeededImage = { imageKey: string; thumbKey: string };

/**
 * Sube `count` imágenes de portafolio para un fotógrafo.
 * Devuelve las claves; si no hay internet, devuelve lista vacía y el sembrado
 * continúa sin fallar.
 */
export async function seedPortfolio(
  photographerSlug: string,
  count: number,
): Promise<SeededImage[]> {
  const out: SeededImage[] = [];
  if (almacenamientoCaido) return out;

  for (let i = 0; i < count; i++) {
    const seed = `${photographerSlug}-${i}`;
    // Original apaisado y miniatura cuadrada: dos derivados, como en producción.
    const [full, thumb] = await Promise.all([
      download(seed, 1200, 800),
      download(seed, 500, 500),
    ]);
    if (!full || !thumb) continue;

    const imageKey = `portfolio/${photographerSlug}/${i}.jpg`;
    const thumbKey = `portfolio/${photographerSlug}/${i}-thumb.jpg`;

    try {
      await Promise.all([upload(imageKey, full), upload(thumbKey, thumb)]);
      out.push({ imageKey, thumbKey });
    } catch {
      // Sin bucket configurado la plataforma funciona igual, solo sin fotos.
      almacenamientoCaido = true;
      return out;
    }
  }

  return out;
}

/** Avatar cuadrado y portada apaisada del perfil. */
export async function seedProfileImages(
  photographerSlug: string,
): Promise<{ avatarKey: string | null; coverKey: string | null }> {
  const [avatar, cover] = await Promise.all([
    download(`${photographerSlug}-avatar`, 400, 400),
    download(`${photographerSlug}-cover`, 1600, 600),
  ]);

  let avatarKey: string | null = null;
  let coverKey: string | null = null;

  try {
    if (avatar) {
      avatarKey = `profiles/${photographerSlug}/avatar.jpg`;
      await upload(avatarKey, avatar);
    }
    if (cover) {
      coverKey = `profiles/${photographerSlug}/cover.jpg`;
      await upload(coverKey, cover);
    }
  } catch {
    almacenamientoCaido = true;
    return { avatarKey: null, coverKey: null };
  }

  return { avatarKey, coverKey };
}
