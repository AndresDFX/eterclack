# 03 — Servidor de correo propio

**Alcance nuevo.** La cotización contemplaba «proveedor transaccional externo». Este documento
reemplaza esa línea por un subsistema construido y operado por nosotros.

---

## 1. Qué hay que entender antes de empezar

Montar un servidor de correo es fácil. **Que los correos lleguen a la bandeja de entrada es lo
difícil.** Gmail, Outlook y Yahoo desconfían por defecto de cualquier IP que no conocen, y una IP de
VPS recién asignada puede venir con historial ajeno.

Este plan asume ese trabajo explícitamente: autenticación correcta (SPF, DKIM, DMARC), PTR,
calentamiento gradual y monitoreo continuo. No es una tarea que se cierra en un sprint — es una
responsabilidad operativa permanente.

**Dos hechos que condicionan todo el diseño:**

1. **Hostinger no bloquea el puerto 25 en VPS**, según su documentación de soporte. Si aparece
   bloqueado, la causa es el firewall del propio VPS. → *Verificar en la semana 28, antes de
   comprometer la fecha de la Fase 2.*
2. **Hostinger limita el envío saliente a 5 correos por minuto.** Este es el dato que más forma le
   da a la arquitectura: no es una anécdota, es una restricción de diseño. Todo el correo sale por
   una cola estrangulada a 4/min (margen de seguridad), lo que da un techo de **240 correos/hora**.
   Suficiente para el volumen transaccional del MVP, pero convierte cualquier envío masivo en
   imposible.

### 1.1 El interruptor de emergencia

Desde el día uno, el transporte de correo es una variable de entorno con tres valores:

```
MAIL_TRANSPORT = mailpit | smtp | relay
```

- `mailpit` — local, captura todo
- `smtp` — servidor propio (producción)
- `relay` — proveedor externo (Brevo, Resend, Amazon SES…)

Si la entregabilidad del servidor propio se degrada de forma crítica en producción, se cambia una
variable y se reinicia. **El correo vuelve a funcionar en menos de dos minutos.** Esta salida no es
opcional: es la mitigación del riesgo más probable del proyecto.

---

## 2. Qué se está construyendo

Cuatro capacidades distintas, que a menudo se confunden:

| Capacidad | Para qué | Prioridad |
|---|---|---|
| **Envío transaccional** | Verificaciones, notificaciones, contratos, avisos de pago | **Crítica** — el producto no funciona sin ella |
| **Recepción de rebotes** | Detectar direcciones inválidas y proteger la reputación | **Alta** |
| **Buzones reales** | `hola@`, `soporte@`, `admin@` para el equipo de EterClack | Media |
| **Recepción de reportes DMARC** | Vigilar suplantación y alineación | Media |

---

## 3. Elección del stack

| Opción | Peso | UI | Veredicto |
|---|---|---|---|
| **`docker-mailserver` (DMS)** | ~1 GB RAM | No (configuración por archivos) | **Elegida** |
| Mailcow | ~6 GB RAM | Sí, completa | Demasiado para el VPS compartido con la app; se justifica solo con webmail para el equipo |
| Mailu | ~2 GB RAM | Sí, básica | Alternativa razonable |
| Stalwart | ~0,5 GB RAM | Sí, moderna | Muy prometedor y ligero, pero menos rodaje en producción |

**Por qué DMS:**

- Postfix + Dovecot + Rspamd + Fail2ban, todos componentes con décadas de rodaje.
- **Configuración en archivos, versionable en git.** Reproducible entre local y producción; nada de
  ajustes hechos a mano en una interfaz que después nadie recuerda.
- Ligero: convive con Postgres, Redis, MinIO y la API en el mismo VPS.
- Gestión de DKIM incluida (`setup config dkim`).
- Documentación excelente y comunidad activa.

Componentes:

| Función | Software |
|---|---|
| MTA (envío/recepción SMTP) | Postfix |
| IMAP (buzones) | Dovecot |
| Antispam, antivirus, firma DKIM | Rspamd |
| Bloqueo de fuerza bruta | Fail2ban |
| Certificados TLS | Compartidos con Caddy vía volumen |

---

## 4. Diseño de la capa de correo en la aplicación

El MTA solo transporta. La lógica —qué se envía, a quién, cuándo, con qué plantilla y qué pasa si
falla— vive en el módulo `mail` de la API.

```
Evento de negocio
      │
      ▼
MailService.send({ template, to, data, priority })
      │
      ├─ ¿destinatario en lista de supresión? → descartar y registrar
      ├─ renderizar plantilla (React Email → HTML + texto plano)
      ├─ persistir en tabla `emails` (estado: queued)
      │
      ▼
Cola BullMQ  «mail»   ── limiter: { max: 4, duration: 60_000 }
      │                  ── prioridades: 1 crítico · 5 normal · 10 informativo
      │                  ── attempts: 5, backoff exponencial
      ▼
Worker de correo → Nodemailer → SMTP (Mailpit | DMS | relay)
      │
      ├─ éxito → estado `sent`, guardar message-id
      └─ fallo → reintento; agotados → estado `failed` + alerta al admin
      │
      ▼
Buzón bounces@ (IMAP) ── worker lector ── analiza DSN
      │
      ├─ rebote duro (5.x.x) → lista de supresión permanente
      └─ rebote blando (4.x.x) → contador; 3 seguidos → supresión temporal
```

### 4.1 Prioridades de la cola

Con solo 4 correos por minuto, **el orden importa**. Un lote de 50 avisos informativos no puede
retrasar 15 minutos la verificación de un usuario que está esperando frente a la pantalla.

| Prioridad | Correos | Espera aceptable |
|---|---|---|
| 1 — Crítico | Verificación de cuenta, recuperación de contraseña, confirmación de pago | < 30 s |
| 5 — Normal | Nueva solicitud, propuesta, contrato aceptado, entrega lista, dispersión pagada | < 5 min |
| 10 — Informativo | Resúmenes, recordatorios, avisos de admin | < 1 h |

### 4.2 Catálogo de correos transaccionales

| # | Plantilla | Destinatario | Disparador | Prioridad |
|---|---|---|---|---|
| 1 | `verify-email` | Cliente/Fotógrafo | Registro | 1 |
| 2 | `password-reset` | Cualquiera | Solicitud de recuperación | 1 |
| 3 | `photographer-application-received` | Fotógrafo | Postulación enviada | 5 |
| 4 | `photographer-approved` / `rejected` | Fotógrafo | Decisión del admin | 5 |
| 5 | `new-request` | Fotógrafo | Cliente crea solicitud | 5 |
| 6 | `proposal-sent` | Cliente | Fotógrafo propone condiciones | 5 |
| 7 | `contract-accepted` | Ambos | Cliente acepta contrato | 5 |
| 8 | `payment-approved` | Ambos | Webhook Wompi `APPROVED` | 1 |
| 9 | `payment-failed` | Cliente | Webhook `DECLINED` / `ERROR` | 1 |
| 10 | `gallery-published` | Cliente | Fotógrafo publica galería | 5 |
| 11 | `selection-submitted` | Fotógrafo | Cliente envía selección final | 5 |
| 12 | `delivery-ready` | Cliente | Fotógrafo marca entrega lista | 5 |
| 13 | `download-links` | Cliente | Genera enlaces firmados | 5 |
| 14 | `payout-scheduled` | Fotógrafo | Saldo entra en corrida | 10 |
| 15 | `payout-paid` | Fotógrafo | Dispersión confirmada | 5 |
| 16 | `payout-failed` | Fotógrafo + Admin | Dispersión rechazada | 1 |
| 17 | `admin-alert` | Admin | Webhook fallido, disco al 70 %, cola atascada | 1 |

**Reglas para todas las plantillas:**

- Versión HTML **y** texto plano. Solo-HTML penaliza la puntuación de spam.
- Asunto sin mayúsculas gritadas, sin `!!!`, sin «GRATIS», sin «URGENTE».
- `From: EterClack <no-reply@eterclack.com>`, `Reply-To: hola@eterclack.com`.
- Enlace de baja en los informativos (no en los transaccionales críticos).
- Sin imágenes remotas pesadas; el logo va incrustado o alojado en `cdn.eterclack.com`.
- Relación texto/HTML sana; nada de un correo que sea una sola imagen.

---

## 5. Registros DNS (en hPanel de Hostinger)

Se configuran en la **Fase 2, sprint S10**. El dominio ya está en Hostinger: la zona DNS se edita en
hPanel, sin mover nameservers.

```dns
; ── Aplicación ────────────────────────────────────────────────
@                   A       <IP_VPS>
www                 A       <IP_VPS>
api                 A       <IP_VPS>
cdn                 A       <IP_VPS>

; ── Correo ────────────────────────────────────────────────────
mail                A       <IP_VPS>
@                   MX  10  mail.eterclack.com.

; SPF — solo el servidor propio puede enviar en nombre del dominio
@                   TXT     "v=spf1 mx a:mail.eterclack.com -all"

; DKIM — la clave pública la genera DMS, ver §6.2
mail._domainkey     TXT     "v=DKIM1; k=rsa; p=MIIBIjANBgkqh..."

; DMARC — empieza permisivo, endurece por etapas (§7.3)
_dmarc              TXT     "v=DMARC1; p=none; rua=mailto:dmarc@eterclack.com; ruf=mailto:dmarc@eterclack.com; fo=1; pct=100; adkim=s; aspf=s"

; MTA-STS y TLS-RPT — opcionales, suman confianza
_mta-sts            TXT     "v=STSv1; id=20260901000000"
_smtp._tls          TXT     "v=TLSRPTv1; rua=mailto:tlsrpt@eterclack.com"
```

Además, y **fuera de DNS**:

- **PTR / rDNS**: `<IP_VPS>` → `mail.eterclack.com`. Se solicita a soporte de Hostinger; no se puede
  configurar desde hPanel. **Sin PTR, Gmail rechaza o marca como spam casi con certeza.** Es el
  primer trámite del sprint S10.
- Alias obligatorios por RFC 2142: `postmaster@` y `abuse@` deben existir y ser leídos.

> ⚠️ **Cutover de MX.** Si el dominio ya recibe correo en Hostinger (Titan o similar), cambiar el MX
> corta ese servicio. Antes de tocarlo: inventariar buzones existentes, exportar, avisar y ejecutar
> el cambio en ventana de bajo tráfico. TTL a 300 s **24 horas antes**, para poder revertir rápido.

---

## 6. Plan de construcción

### S4 · Semana 14 — Cimientos

- [x] Módulo `mail` con transporte intercambiable (mailpit | smtp | relay) — **hecho en Fase 1**
- [ ] Cola BullMQ con limitador y prioridades
- [ ] Tabla `emails`: estado, plantilla, destinatario, message-id, intentos, error
- [ ] Plantillas 1 y 2 (verificación y recuperación) en React Email, con texto plano
- [ ] Ruta `/dev/emails` para previsualizar todas las plantillas sin enviarlas
- [ ] Pruebas de integración que leen la API de Mailpit

### S4 · Semana 15 — El MTA real, en local

- [ ] `docker-mailserver` bajo perfil de compose, con configuración en `infra/mailserver/`
- [ ] Buzones: `no-reply@`, `hola@`, `soporte@`, `bounces@`, `dmarc@`, `postmaster@`, `abuse@`
- [ ] Generar claves DKIM: `docker exec mailserver setup config dkim domain eterclack.com`
- [ ] Rspamd activo; ajustar umbrales
- [ ] Apuntar la API a DMS (`MAIL_TRANSPORT=smtp`, puerto 1587) y enviar de extremo a extremo
- [ ] Verificar la firma DKIM en la cabecera del mensaje recibido
- [ ] Documentar la configuración en `infra/mailserver/README.md`

### S4 · Semana 16 — Rebotes y resto del catálogo

- [ ] Worker IMAP que lee `bounces@` cada 5 minutos
- [ ] Análisis de DSN: distinguir rebote duro (5.x.x) de blando (4.x.x)
- [ ] Tabla `email_suppressions` con motivo, origen y fecha; consulta obligatoria antes de encolar
- [ ] Plantillas 3 a 17
- [ ] Panel admin: bandeja de correos enviados, fallidos y suprimidos, con reenvío manual
- [ ] Alerta cuando la cola supere 100 pendientes o haya más de 5 fallos seguidos

### S10 · Semana 31 — Producción y entregabilidad

- [ ] Registros DNS en hPanel (§5)
- [ ] Solicitar PTR a soporte de Hostinger y **confirmar** que quedó aplicado
- [ ] TLS real: compartir los certificados de Caddy con DMS por volumen
- [ ] Verificar que el puerto 25 saliente funciona: `telnet gmail-smtp-in.l.google.com 25`
- [ ] Cutover de MX con TTL reducido y plan de reversa
- [ ] Fail2ban y ClamAV activos
- [ ] Ejecutar el calentamiento (§7.2)
- [ ] Puntaje 10/10 en mail-tester.com
- [ ] Alta en Google Postmaster Tools y Microsoft SNDS
- [ ] Verificar ausencia en listas negras: Spamhaus, Barracuda, SORBS
- [ ] Parseo de reportes DMARC agregados hacia el panel admin
- [ ] Copia de seguridad de las claves DKIM (si se pierden, todo el correo falla la verificación)

---

## 7. Entregabilidad

### 7.1 Lista de verificación

| Control | Efecto si falta |
|---|---|
| PTR/rDNS coincidente con el HELO | Rechazo casi seguro en Gmail |
| SPF con `-all` | Suplantación posible; puntuación de spam más alta |
| DKIM firmando el 100 % del correo saliente | Sin DKIM no hay alineación DMARC |
| DMARC publicado | Sin visibilidad de suplantación |
| HELO/EHLO = `mail.eterclack.com` (FQDN, no `localhost`) | Rechazo |
| TLS en saliente (opportunistic) | Penalización |
| `List-Unsubscribe` en informativos | Marcas de spam de usuarios |
| Volumen constante, sin picos | Los picos disparan alarmas antispam |
| Tasa de rebote < 5 % | Reputación cae rápido |
| Cero envíos a direcciones no verificadas | Trampas de spam |

### 7.2 Calentamiento de IP — semana 31

Una IP nueva enviando 200 correos el primer día es la definición de comportamiento de spammer.

| Día | Volumen máximo | Destinos |
|---|---|---|
| 1–2 | 10/día | Cuentas propias en Gmail, Outlook, Yahoo — abrir y marcar «no es spam» |
| 3–5 | 30/día | Sumar el equipo de EterClack |
| 6–10 | 80/día | Sumar los fotógrafos del piloto |
| 11–14 | 150/día | Tráfico del piloto |
| 15+ | Normal | Techo real: 240/h por el límite de Hostinger |

Regla: **si la tasa de rebote pasa de 5 % o aparece un bloqueo, se detiene el escalado y se
diagnostica** antes de seguir.

### 7.3 Endurecimiento progresivo de DMARC

| Momento | Política | Condición para avanzar |
|---|---|---|
| Semana 31 | `p=none` | Publicar y empezar a recibir reportes |
| Semana 33 | `p=quarantine; pct=25` | Dos semanas de reportes sin fallos de alineación |
| Mes 2 posproducción | `p=quarantine; pct=100` | Sin incidentes |
| Mes 3 posproducción | `p=reject` | Alineación al 100 % confirmada |

**No saltar etapas.** Poner `p=reject` antes de tiempo hace desaparecer correo legítimo en silencio,
que es el peor modo de falla posible: nadie se entera.

---

## 8. Operación continua

Esto es lo que la cotización no incluía y ahora es responsabilidad permanente:

| Frecuencia | Tarea |
|---|---|
| Diaria | Revisar cola de correo, fallos y tasa de rebote (panel admin) |
| Semanal | Revisar reportes DMARC agregados; verificar listas negras |
| Semanal | Google Postmaster Tools: reputación de dominio e IP |
| Mensual | Actualizar la imagen de DMS y aplicar parches |
| Trimestral | Rotar claves DKIM (con periodo de solapamiento) |
| Continua | Responder `abuse@` y `postmaster@` — ignorarlos daña la reputación |

### 8.1 Alertas automáticas

| Condición | Acción |
|---|---|
| Cola de correo > 100 pendientes durante 10 min | Alerta al admin |
| Tasa de rebote > 5 % en 24 h | Alerta y pausa de envíos informativos |
| Aparición en lista negra | Alerta crítica |
| Puerto 25 saliente inalcanzable | Alerta crítica |
| Certificado TLS a menos de 15 días de vencer | Alerta |
| Disco de `/var/mail` al 80 % | Alerta |

---

## 9. Fuentes

- Hostinger — Puerto SMTP 25 en VPS y límite de 5 correos/min: https://www.hostinger.com/support/7854530-is-smtp-port-25-blocked-on-hostinger-vps/
- docker-mailserver — documentación: https://docker-mailserver.github.io/docker-mailserver/latest/
- RFC 2142 — buzones de rol (`postmaster`, `abuse`): https://www.rfc-editor.org/rfc/rfc2142

Consulta realizada el 22 de agosto de 2026. Verificar la política vigente de Hostinger antes de la
Fase 2.
