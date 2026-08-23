import { z } from 'zod';

const intFromEnv = (def: number) =>
  z.coerce.number().int().default(def);

const boolFromEnv = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

/**
 * Render inyecta la URL pública del servicio. Si está, se usa como valor por
 * defecto de WEB_URL y API_URL: un paso manual menos, y sin el riesgo de que
 * queden apuntando a localhost en producción.
 */
const URL_RENDER = process.env.RENDER_EXTERNAL_URL?.trim() ?? '';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('EterClack'),
  PORT: intFromEnv(3000),
  WEB_URL: z.string().url().default(URL_RENDER || 'http://localhost:5173'),
  API_URL: z.string().url().default(URL_RENDER || 'http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  // Declarado para cuando entren las colas (miniaturas, correo, dispersión).
  // Hoy nada se conecta, así que no obliga a levantar el servicio.
  REDIS_URL: z.string().default(''),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  COOKIE_SECRET: z.string().min(16),

  /**
   * Almacenamiento de objetos. Sin configurar, la aplicación arranca igual
   * y los perfiles se ven sin portafolio: es preferible a negarse a levantar
   * por una pieza que no bloquea el flujo de reserva.
   */
  S3_ENDPOINT: z.string().default('http://minio:9000'),
  S3_PUBLIC_ENDPOINT: z.string().default('http://localhost:9000'),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().default(''),
  S3_SECRET_KEY: z.string().default(''),
  S3_FORCE_PATH_STYLE: boolFromEnv(true),
  S3_BUCKET_PHOTOS: z.string().default('eterclack-photos'),
  S3_BUCKET_CONTRACTS: z.string().default('eterclack-contracts'),
  S3_BUCKET_PUBLIC: z.string().default('eterclack-public'),
  /**
   * URL base de los archivos públicos. MinIO sirve en
   * {endpoint}/{bucket}/{clave}; R2 y B2 usan un dominio propio por bucket.
   * Si se define, gana sobre la forma de MinIO.
   */
  S3_PUBLIC_BASE_URL: z.string().default(''),
  S3_UPLOAD_URL_TTL: intFromEnv(300),
  S3_DOWNLOAD_URL_TTL: intFromEnv(900),

  MAIL_TRANSPORT: z.enum(['mailpit', 'smtp', 'relay']).default('mailpit'),
  SMTP_HOST: z.string().default('mailpit'),
  SMTP_PORT: intFromEnv(1025),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_SECURE: boolFromEnv(false),
  MAIL_FROM_NAME: z.string().default('EterClack'),
  MAIL_FROM_ADDRESS: z.string().default('no-reply@eterclack.com'),
  MAIL_REPLY_TO: z.string().default('hola@eterclack.com'),
  MAIL_RATE_PER_MINUTE: intFromEnv(4),

  WOMPI_BASE_URL: z.string().default('https://sandbox.wompi.co/v1'),
  WOMPI_PUBLIC_KEY: z.string().default(''),
  WOMPI_PRIVATE_KEY: z.string().default(''),
  WOMPI_INTEGRITY_SECRET: z.string().default(''),
  WOMPI_EVENTS_SECRET: z.string().default(''),

  WOMPI_PAYOUTS_BASE_URL: z.string().default(''),
  WOMPI_PAYOUTS_API_KEY: z.string().default(''),
  WOMPI_PAYOUTS_USER_PRINCIPAL_ID: z.string().default(''),
  WOMPI_PAYOUTS_ACCOUNT_ID: z.string().default(''),
  PAYOUTS_ENABLED: boolFromEnv(false),
  PAYOUTS_REQUIRE_ADMIN_APPROVAL: boolFromEnv(true),

  /**
   * Sirve el frontend compilado desde la misma API.
   *
   * En Render es obligatorio: `onrender.com` está en la Public Suffix List,
   * así que dos subdominios son sitios DISTINTOS y una cookie SameSite=Lax
   * no viajaría entre ellos. Un solo origen evita el problema de raíz, sin
   * tener que debilitar la cookie a SameSite=None.
   */
  SERVE_WEB: boolFromEnv(false),
  WEB_DIST_PATH: z.string().default('../web/dist'),

  PLATFORM_COMMISSION_BPS: intFromEnv(1500),
  PAYOUT_HOLD_DAYS: intFromEnv(5),
  PAYOUT_MIN_AMOUNT_CENTS: intFromEnv(5_000_000),
});

/**
 * Render crea las variables marcadas `sync: false` que se dejan en blanco
 * como CADENA VACÍA. Para zod, '' no es undefined: el `.default()` no se
 * aplica y una validación como `.url()` falla, tumbando el arranque con un
 * mensaje que no sugiere la causa.
 *
 * Normalizar aquí resuelve el problema para todas las variables a la vez,
 * en vez de tener que recordar el caso en cada esquema.
 */
const entorno = Object.fromEntries(
  Object.entries(process.env).filter(([, valor]) => valor !== undefined && valor.trim() !== ''),
);

const parsed = schema.safeParse(entorno);

if (!parsed.success) {
  console.error('✗ La aplicación no puede arrancar: variables de entorno inválidas.');
  for (const issue of parsed.error.issues) {
    console.error(`  · ${issue.path.join('.')}: ${issue.message}`);
  }
  console.error('');
  console.error('  Revisa la sección Environment del servicio. Una variable en blanco');
  console.error('  equivale a no definirla: se usa el valor por defecto.');
  process.exit(1);
}

export const env = parsed.data;

/**
 * Guarda de coherencia entre ambiente y llaves de Wompi.
 * Un error de configuración aquí, descubierto en caliente, cuesta transacciones reales.
 */
export function assertWompiEnvironmentCoherence(): void {
  const isProd = env.WOMPI_BASE_URL.includes('production');
  const keyIsTest = env.WOMPI_PUBLIC_KEY.startsWith('pub_test_');
  const keyIsProd = env.WOMPI_PUBLIC_KEY.startsWith('pub_prod_');

  if (!env.WOMPI_PUBLIC_KEY) return; // sin configurar todavía: se permite

  if (isProd && keyIsTest) {
    throw new Error('Wompi: URL de producción con llave pub_test_. Abortando.');
  }
  if (!isProd && keyIsProd) {
    throw new Error('Wompi: URL de sandbox con llave pub_prod_. Abortando.');
  }
}
