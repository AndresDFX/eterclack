import { z } from 'zod';

const intFromEnv = (def: number) =>
  z.coerce.number().int().default(def);

const boolFromEnv = (def: boolean) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined ? def : v === 'true' || v === '1'));

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_NAME: z.string().default('EterClack'),
  PORT: intFromEnv(3000),
  WEB_URL: z.string().url().default('http://localhost:5173'),
  API_URL: z.string().url().default('http://localhost:3000'),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_ACCESS_SECRET: z.string().min(16),
  JWT_REFRESH_SECRET: z.string().min(16),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('30d'),
  COOKIE_SECRET: z.string().min(16),

  S3_ENDPOINT: z.string().url(),
  S3_PUBLIC_ENDPOINT: z.string().url(),
  S3_REGION: z.string().default('us-east-1'),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_FORCE_PATH_STYLE: boolFromEnv(true),
  S3_BUCKET_PHOTOS: z.string().default('eterclack-photos'),
  S3_BUCKET_CONTRACTS: z.string().default('eterclack-contracts'),
  S3_BUCKET_PUBLIC: z.string().default('eterclack-public'),
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

  PLATFORM_COMMISSION_BPS: intFromEnv(1500),
  PAYOUT_HOLD_DAYS: intFromEnv(5),
  PAYOUT_MIN_AMOUNT_CENTS: intFromEnv(5_000_000),
});

const parsed = schema.safeParse(process.env);

if (!parsed.success) {
  console.error('✗ Variables de entorno inválidas:');
  for (const issue of parsed.error.issues) {
    console.error(`  · ${issue.path.join('.')}: ${issue.message}`);
  }
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
