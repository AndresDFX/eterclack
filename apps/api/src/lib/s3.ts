import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { env } from '../env.js';

/**
 * Cliente S3 apuntando a MinIO en local. En producción se apunta a MinIO en el
 * VPS o directamente a Backblaze B2 cambiando solo variables de entorno.
 */
export const s3 = new S3Client({
  endpoint: env.S3_ENDPOINT,
  region: env.S3_REGION,
  forcePathStyle: env.S3_FORCE_PATH_STYLE,
  credentials: {
    accessKeyId: env.S3_ACCESS_KEY,
    secretAccessKey: env.S3_SECRET_KEY,
  },
});

export const BUCKETS = {
  photos: env.S3_BUCKET_PHOTOS,
  contracts: env.S3_BUCKET_CONTRACTS,
  public: env.S3_BUCKET_PUBLIC,
} as const;

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export type UploadTarget = keyof typeof BUCKETS;

/** Clave de objeto no adivinable y separada por proyecto. */
export function buildObjectKey(prefix: string, filename: string): string {
  const ext = (filename.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${prefix}/${randomUUID()}.${ext}`;
}

/**
 * URL prefirmada para subida directa navegador → almacenamiento.
 * Los archivos nunca pasan por la memoria de la API.
 */
export async function presignUpload(opts: {
  bucket: UploadTarget;
  key: string;
  contentType: string;
  contentLength: number;
}): Promise<{ url: string; key: string; expiresIn: number }> {
  if (!ALLOWED_IMAGE_TYPES.includes(opts.contentType as (typeof ALLOWED_IMAGE_TYPES)[number])) {
    throw new Error(`Tipo de archivo no permitido: ${opts.contentType}`);
  }
  if (opts.contentLength > MAX_UPLOAD_BYTES) {
    throw new Error('El archivo supera el límite de 25 MB');
  }

  const url = await getSignedUrl(
    s3,
    new PutObjectCommand({
      Bucket: BUCKETS[opts.bucket],
      Key: opts.key,
      ContentType: opts.contentType,
      ContentLength: opts.contentLength,
    }),
    { expiresIn: env.S3_UPLOAD_URL_TTL },
  );

  return { url, key: opts.key, expiresIn: env.S3_UPLOAD_URL_TTL };
}

/** URL firmada de descarga. Se emite SOLO tras verificar propiedad del recurso. */
export async function presignDownload(bucket: UploadTarget, key: string): Promise<string> {
  return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKETS[bucket], Key: key }), {
    expiresIn: env.S3_DOWNLOAD_URL_TTL,
  });
}

export async function deleteObject(bucket: UploadTarget, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: BUCKETS[bucket], Key: key }));
}

/** URL directa para el bucket público (avatares, portafolios, miniaturas). */
export function publicUrl(key: string | null | undefined): string | null {
  if (!key) return null;
  return `${env.S3_PUBLIC_ENDPOINT}/${BUCKETS.public}/${key}`;
}
