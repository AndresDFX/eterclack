import { env } from '../env.js';

// ─── Marca EterClack ──────────────────────────────────────────────
const BRAND = {
  ink: '#1D1D1B', // carbón
  bone: '#E6E6E6', // blanco hueso
  lime: '#E7E226', // amarillo lima
  muted: '#8A8A85',
  line: '#33332F',
} as const;

/** Esquinas de visor: el motivo gráfico de la marca. */
function corners(): string {
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
      <tr>
        <td width="18" height="18" style="background:${BRAND.lime};font-size:0;line-height:0;">&nbsp;</td>
        <td>&nbsp;</td>
        <td width="18" height="18" style="background:${BRAND.lime};font-size:0;line-height:0;">&nbsp;</td>
      </tr>
    </table>`;
}

function layout(title: string, body: string, cta?: { label: string; url: string }): string {
  const button = cta
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:28px 0;">
         <tr><td style="background:${BRAND.lime};">
           <a href="${cta.url}"
              style="display:inline-block;padding:14px 28px;font-family:Arial,Helvetica,sans-serif;
                     font-size:15px;font-weight:bold;color:${BRAND.ink};text-decoration:none;
                     letter-spacing:.02em;">${cta.label}</a>
         </td></tr>
       </table>
       <p style="margin:0 0 8px;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${BRAND.muted};">
         Si el botón no funciona, copia este enlace:</p>
       <p style="margin:0 0 24px;font-family:Arial,Helvetica,sans-serif;font-size:12px;
                 color:${BRAND.muted};word-break:break-all;">${cta.url}</p>`
    : '';

  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title></head>
<body style="margin:0;padding:0;background:${BRAND.ink};">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:${BRAND.ink};">
<tr><td align="center" style="padding:40px 16px;">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="560"
         style="max-width:560px;width:100%;background:#232320;">
    <tr><td style="padding:20px 24px 0;">${corners()}</td></tr>
    <tr><td style="padding:24px 32px 0;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:26px;font-weight:bold;
                  color:${BRAND.bone};letter-spacing:-.02em;line-height:1;">eter<span style="color:${BRAND.bone};">clack</span></div>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:10px;color:${BRAND.muted};
                  letter-spacing:.18em;margin-top:6px;">FOTOGRAFÍA Y VIDEO</div>
    </td></tr>
    <tr><td style="padding:28px 32px 8px;">
      <h1 style="margin:0 0 16px;font-family:Arial,Helvetica,sans-serif;font-size:22px;
                 font-weight:bold;color:${BRAND.bone};line-height:1.25;">${title}</h1>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.6;color:${BRAND.bone};">
        ${body}
      </div>
      ${button}
    </td></tr>
    <tr><td style="padding:0 32px 24px;">
      <div style="border-top:1px solid ${BRAND.line};padding-top:16px;
                  font-family:Arial,Helvetica,sans-serif;font-size:12px;color:${BRAND.muted};line-height:1.5;">
        ETERnidad a un solo CLACK<br>
        <a href="${env.WEB_URL}" style="color:${BRAND.muted};">eterclack.com</a>
      </div>
    </td></tr>
    <tr><td style="padding:0 24px 20px;">${corners()}</td></tr>
  </table>
</td></tr></table>
</body></html>`;
}

// ─── Definición de plantillas ─────────────────────────────────────

export type TemplateData = {
  'verify-email': { name: string; url: string };
  'password-reset': { name: string; url: string };
  'welcome-client': { name: string };
  'photographer-application-received': { name: string };
  'photographer-approved': { name: string; profileUrl: string };
  'photographer-rejected': { name: string; reason: string };
  'booking-created-photographer': {
    name: string;
    clientName: string;
    eventDate: string;
    turn: string;
    packageName: string;
    amountCents: string;
    url: string;
  };
  'booking-created-client': {
    name: string;
    photographerName: string;
    eventDate: string;
    packageName: string;
    amountCents: string;
    holdHours: number;
    url: string;
  };
  'contract-accepted': { name: string; orderCode: string; url: string };
};

export type TemplateName = keyof TemplateData;

type Rendered = { subject: string; html: string; text: string };

export function renderTemplate<T extends TemplateName>(
  name: T,
  data: TemplateData[T],
): Rendered {
  switch (name) {
    case 'verify-email': {
      const d = data as TemplateData['verify-email'];
      return {
        subject: 'Confirma tu correo en EterClack',
        html: layout(
          'Confirma tu correo',
          `<p>Hola ${escapeHtml(d.name)},</p>
           <p>Falta un paso para activar tu cuenta. Confirma tu correo y empieza a usar EterClack.</p>
           <p style="color:${BRAND.muted};font-size:13px;">El enlace vence en 24 horas.</p>`,
          { label: 'Confirmar mi correo', url: d.url },
        ),
        text: `Hola ${d.name},\n\nConfirma tu correo para activar tu cuenta en EterClack:\n${d.url}\n\nEl enlace vence en 24 horas.\n\nETERnidad a un solo CLACK`,
      };
    }

    case 'password-reset': {
      const d = data as TemplateData['password-reset'];
      return {
        subject: 'Recupera tu contraseña de EterClack',
        html: layout(
          'Recupera tu contraseña',
          `<p>Hola ${escapeHtml(d.name)},</p>
           <p>Recibimos una solicitud para restablecer tu contraseña.</p>
           <p style="color:${BRAND.muted};font-size:13px;">El enlace vence en 1 hora.
              Si no fuiste tú, ignora este correo: tu contraseña no cambia.</p>`,
          { label: 'Crear contraseña nueva', url: d.url },
        ),
        text: `Hola ${d.name},\n\nRestablece tu contraseña:\n${d.url}\n\nVence en 1 hora. Si no fuiste tú, ignora este correo.`,
      };
    }

    case 'welcome-client': {
      const d = data as TemplateData['welcome-client'];
      return {
        subject: 'Bienvenido a EterClack',
        html: layout(
          'Tu cuenta está lista',
          `<p>Hola ${escapeHtml(d.name)},</p>
           <p>Ya puedes explorar fotógrafos por especialidad, zona y presupuesto, y solicitar tu primera sesión.</p>`,
          { label: 'Explorar fotógrafos', url: `${env.WEB_URL}/fotografos` },
        ),
        text: `Hola ${d.name},\n\nTu cuenta en EterClack está lista. Explora fotógrafos en ${env.WEB_URL}/fotografos`,
      };
    }

    case 'photographer-application-received': {
      const d = data as TemplateData['photographer-application-received'];
      return {
        subject: 'Recibimos tu postulación · EterClack',
        html: layout(
          'Postulación recibida',
          `<p>Hola ${escapeHtml(d.name)},</p>
           <p>Tu perfil entró en revisión. Nuestro equipo lo valida y te avisamos por este medio.</p>
           <p>Mientras tanto puedes completar tu portafolio, paquetes y disponibilidad: un perfil completo se aprueba más rápido.</p>`,
          { label: 'Completar mi perfil', url: `${env.WEB_URL}/panel/perfil` },
        ),
        text: `Hola ${d.name},\n\nRecibimos tu postulación y está en revisión. Completa tu perfil en ${env.WEB_URL}/panel/perfil`,
      };
    }

    case 'photographer-approved': {
      const d = data as TemplateData['photographer-approved'];
      return {
        subject: '¡Tu perfil fue aprobado! · EterClack',
        html: layout(
          'Tu perfil está publicado',
          `<p>Hola ${escapeHtml(d.name)},</p>
           <p>Aprobamos tu perfil. Ya apareces en las búsquedas y puedes recibir solicitudes de clientes.</p>
           <p>Revisa que tu agenda y tus paquetes estén al día.</p>`,
          { label: 'Ver mi perfil público', url: d.profileUrl },
        ),
        text: `Hola ${d.name},\n\nTu perfil fue aprobado y ya aparece en las búsquedas: ${d.profileUrl}`,
      };
    }

    case 'photographer-rejected': {
      const d = data as TemplateData['photographer-rejected'];
      return {
        subject: 'Sobre tu postulación · EterClack',
        html: layout(
          'Necesitamos algunos ajustes',
          `<p>Hola ${escapeHtml(d.name)},</p>
           <p>Revisamos tu postulación y por ahora no podemos aprobarla. Motivo:</p>
           <p style="border-left:3px solid ${BRAND.lime};padding-left:14px;color:${BRAND.bone};">
             ${escapeHtml(d.reason)}</p>
           <p>Puedes corregirlo y volver a postularte cuando quieras.</p>`,
          { label: 'Editar mi postulación', url: `${env.WEB_URL}/panel/perfil` },
        ),
        text: `Hola ${d.name},\n\nPor ahora no podemos aprobar tu postulación.\nMotivo: ${d.reason}\n\nPuedes corregirlo y volver a postularte.`,
      };
    }



    case 'contract-accepted': {
      const d = data as TemplateData['contract-accepted'];
      return {
        subject: `Contrato aceptado · Orden ${d.orderCode}`,
        html: layout(
          'Contrato aceptado',
          `<p>Hola ${escapeHtml(d.name)},</p>
           <p>Quedó registrada la aceptación del contrato de la orden
              <strong>${escapeHtml(d.orderCode)}</strong>, con fecha, hora y evidencia.</p>
           <p>El siguiente paso es el pago para confirmar la reserva y bloquear la fecha.</p>`,
          { label: 'Ver la orden', url: d.url },
        ),
        text: `Hola ${d.name},

Quedó aceptado el contrato de la orden ${d.orderCode}.
Siguiente paso: el pago.
${d.url}`,
      };
    }

    case 'booking-created-photographer': {
      const d = data as TemplateData['booking-created-photographer'];
      return {
        subject: `Nueva cita: ${d.eventDate} · EterClack`,
        html: layout(
          'Te reservaron una cita',
          `<p>Hola ${escapeHtml(d.name)},</p>
           <p><strong>${escapeHtml(d.clientName)}</strong> reservó una cita en tu calendario.</p>
           <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%"
                  style="margin:20px 0;border-left:3px solid ${BRAND.lime};">
             <tr><td style="padding:4px 0 4px 14px;font-family:Arial,Helvetica,sans-serif;font-size:14px;color:${BRAND.bone};">
               <strong>Fecha:</strong> ${escapeHtml(d.eventDate)} · ${escapeHtml(turnLabel(d.turn))}<br>
               <strong>Producto:</strong> ${escapeHtml(d.packageName)}<br>
               <strong>Valor:</strong> ${formatMoney(d.amountCents)}
             </td></tr>
           </table>
           <p style="color:${BRAND.muted};font-size:13px;">La fecha queda retenida en tu agenda.
              Se confirma cuando el cliente acepte el contrato y pague.</p>`,
          { label: 'Ver mis citas', url: d.url },
        ),
        text: `Hola ${d.name},

${d.clientName} reservó una cita.
Fecha: ${d.eventDate} (${turnLabel(d.turn)})
Producto: ${d.packageName}
Valor: ${formatMoney(d.amountCents)}

${d.url}`,
      };
    }

    case 'booking-created-client': {
      const d = data as TemplateData['booking-created-client'];
      return {
        subject: 'Reservamos tu fecha · EterClack',
        html: layout(
          'Tu fecha está apartada',
          `<p>Hola ${escapeHtml(d.name)},</p>
           <p>Apartamos el <strong>${escapeHtml(d.eventDate)}</strong> con
              <strong>${escapeHtml(d.photographerName)}</strong>, producto
              <strong>${escapeHtml(d.packageName)}</strong> por
              <strong style="color:${BRAND.lime};">${formatMoney(d.amountCents)}</strong>.</p>
           <p>Para confirmarla debes aceptar el contrato y pagar.
              Tienes <strong>${d.holdHours} horas</strong>: pasado ese plazo la fecha vuelve a quedar libre.</p>`,
          { label: 'Confirmar mi cita', url: d.url },
        ),
        text: `Hola ${d.name},

Apartamos el ${d.eventDate} con ${d.photographerName}.
Producto: ${d.packageName} — ${formatMoney(d.amountCents)}

Confirma en ${d.holdHours} horas: ${d.url}`,
      };
    }

    default: {
      const _exhaustive: never = name;
      throw new Error(`Plantilla desconocida: ${String(_exhaustive)}`);
    }
  }
}

/** Los montos viajan como centavos en texto; aquí se presentan. */
function turnLabel(turn: string): string {
  return turn === 'MANANA' ? 'mañana' : turn === 'TARDE' ? 'tarde' : 'jornada completa';
}

function formatMoney(cents: string): string {
  const pesos = BigInt(cents) / 100n;
  return `$${pesos.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
