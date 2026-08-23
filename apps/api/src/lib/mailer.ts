import nodemailer, { type Transporter } from 'nodemailer';
import { env } from '../env.js';
import { prisma } from '../db.js';
import { renderTemplate, type TemplateName, type TemplateData } from './templates.js';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (transporter) return transporter;

  transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_SECURE,
    auth: env.SMTP_USER ? { user: env.SMTP_USER, pass: env.SMTP_PASSWORD } : undefined,
    // Hostinger limita a 5 correos/min en VPS: se estrangula por debajo del techo.
    pool: true,
    maxConnections: 1,
    rateLimit: env.MAIL_RATE_PER_MINUTE,
    rateDelta: 60_000,
    tls: { rejectUnauthorized: env.NODE_ENV === 'production' },
  });

  return transporter;
}

export type SendOptions<T extends TemplateName> = {
  template: T;
  to: string;
  data: TemplateData[T];
  /** 1 crítico · 5 normal · 10 informativo */
  priority?: number;
};

/**
 * Envía un correo transaccional. Registra siempre en la tabla `emails`,
 * y respeta la lista de supresión antes de intentar cualquier envío.
 */
export async function sendMail<T extends TemplateName>(opts: SendOptions<T>): Promise<void> {
  const { template, to, data, priority = 5 } = opts;

  const suppressed = await prisma.emailSuppression.findUnique({ where: { address: to } });
  if (suppressed) {
    await prisma.email.create({
      data: { template, toAddress: to, subject: '(suprimido)', status: 'SUPPRESSED', priority },
    });
    return;
  }

  const rendered = renderTemplate(template, data);

  const record = await prisma.email.create({
    data: { template, toAddress: to, subject: rendered.subject, status: 'QUEUED', priority },
  });

  try {
    const info = await getTransporter().sendMail({
      from: `"${env.MAIL_FROM_NAME}" <${env.MAIL_FROM_ADDRESS}>`,
      replyTo: env.MAIL_REPLY_TO,
      to,
      subject: rendered.subject,
      text: rendered.text,
      html: rendered.html,
    });

    await prisma.email.update({
      where: { id: record.id },
      data: { status: 'SENT', messageId: info.messageId, sentAt: new Date(), attempts: 1 },
    });
  } catch (error) {
    await prisma.email.update({
      where: { id: record.id },
      data: {
        status: 'FAILED',
        attempts: 1,
        error: error instanceof Error ? error.message : String(error),
      },
    });
    // No se relanza: un fallo de correo no debe tumbar la operación de negocio.
  }
}
