# 02 — Entorno local (Fase 1)

Todo el desarrollo de las semanas 1–29 ocurre aquí. No se contrata VPS hasta la semana 28.

**Principio rector:** el entorno local debe ser *isomorfo* al de producción. Los mismos motores, las
mismas versiones, las mismas interfaces. Lo único que cambia son los valores de `.env`. Si algo
funciona local y falla en Hostinger, es un defecto de este principio.

| Servicio | Producción | Local | Interfaz |
|---|---|---|---|
| Base de datos | PostgreSQL 16 | PostgreSQL 16 | idéntica |
| Caché y colas | Redis 7 | Redis 7 | idéntica |
| Archivos | MinIO | MinIO | idéntica (S3) |
| Correo (envío) | `docker-mailserver` | **Mailpit** por defecto, DMS bajo perfil | SMTP — idéntica |
| Proxy y TLS | Caddy | Vite dev server | difiere (aceptable) |
| Wompi | producción | **sandbox** | idéntica |

---

## 1. Requisitos

- Docker Desktop con WSL2 (Windows 11)
- Node.js 22 LTS (solo para editar; todo corre en Docker)
- `mkcert` para certificados locales de confianza (opcional pero recomendado)
- Una cuenta de túnel para webhooks: `ngrok`, `localtunnel` o `tailscale funnel`

---

## 2. `infra/compose/docker-compose.yml`

```yaml
name: eterclack

services:
  postgres:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_USER: eterclack
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:-dev_local_pwd}
      POSTGRES_DB: eterclack
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U eterclack"]
      interval: 5s
      retries: 10

  redis:
    image: redis:7-alpine
    restart: unless-stopped
    command: redis-server --appendonly yes
    ports: ["6379:6379"]
    volumes:
      - redisdata:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      retries: 10

  minio:
    image: minio/minio:latest
    restart: unless-stopped
    command: server /data --console-address ":9001"
    environment:
      MINIO_ROOT_USER: ${S3_ACCESS_KEY:-eterclack}
      MINIO_ROOT_PASSWORD: ${S3_SECRET_KEY:-dev_local_pwd}
    ports:
      - "9000:9000"   # API S3
      - "9001:9001"   # consola web
    volumes:
      - miniodata:/data
    healthcheck:
      test: ["CMD", "mc", "ready", "local"]
      interval: 5s
      retries: 10

  # Crea los buckets al arrancar. Corre una vez y termina.
  minio-init:
    image: minio/mc:latest
    depends_on:
      minio: { condition: service_healthy }
    entrypoint: >
      /bin/sh -c "
      mc alias set local http://minio:9000 $${S3_ACCESS_KEY} $${S3_SECRET_KEY};
      mc mb -p local/eterclack-photos;
      mc mb -p local/eterclack-contracts;
      mc mb -p local/eterclack-public;
      mc anonymous set none local/eterclack-photos;
      mc anonymous set none local/eterclack-contracts;
      mc anonymous set download local/eterclack-public;
      echo 'buckets listos';
      "
    environment:
      S3_ACCESS_KEY: ${S3_ACCESS_KEY:-eterclack}
      S3_SECRET_KEY: ${S3_SECRET_KEY:-dev_local_pwd}

  # Captura TODO el correo saliente. Nada sale a internet.
  mailpit:
    image: axllent/mailpit:latest
    restart: unless-stopped
    ports:
      - "1025:1025"   # SMTP
      - "8025:8025"   # interfaz web
    environment:
      MP_MAX_MESSAGES: 500
      MP_SMTP_AUTH_ACCEPT_ANY: 1
      MP_SMTP_AUTH_ALLOW_INSECURE: 1

volumes:
  pgdata:
  redisdata:
  miniodata:
```

### 2.1 Perfil `mailserver` — el MTA real, en local

A partir de S4 se levanta el servidor de correo verdadero para desarrollar su configuración. Vive en
`infra/compose/docker-compose.mailserver.yml` y se activa con un perfil, para no cargarlo en el día
a día.

```yaml
name: eterclack

services:
  mailserver:
    image: ghcr.io/docker-mailserver/docker-mailserver:latest
    profiles: ["mailserver"]
    hostname: mail.eterclack.local
    restart: unless-stopped
    ports:
      - "2525:25"     # SMTP  (puertos altos: no requieren privilegios en local)
      - "1465:465"    # SMTPS
      - "1587:587"    # submission
      - "1993:993"    # IMAPS
    volumes:
      - ../mailserver/mail-data:/var/mail
      - ../mailserver/mail-state:/var/mail-state
      - ../mailserver/mail-logs:/var/log/mail
      - ../mailserver/config:/tmp/docker-mailserver
    environment:
      ENABLE_RSPAMD: 1
      ENABLE_OPENDKIM: 0          # Rspamd firma DKIM
      ENABLE_DMARC: 1
      ENABLE_FAIL2BAN: 0          # innecesario en local
      ENABLE_CLAMAV: 0            # pesado; se activa en producción
      SSL_TYPE: ""                # sin TLS en local
      PERMIT_DOCKER: connected-networks
      LOG_LEVEL: debug
    cap_add: [NET_ADMIN]
```

```bash
docker compose --profile mailserver up -d
```

Detalle de configuración en [03 — Servidor de correo](03-servidor-correo.md).

---

## 3. Variables de entorno

`.env.example` (versionado; `.env` nunca se sube):

```bash
# ─── Aplicación ─────────────────────────────────────────────────
NODE_ENV=development
APP_URL=http://localhost:5173
API_URL=http://localhost:3000
PORT=3000

# ─── Base de datos ──────────────────────────────────────────────
DATABASE_URL=postgresql://eterclack:eterclack_dev@localhost:55432/eterclack

# ─── Redis / colas ──────────────────────────────────────────────
REDIS_URL=redis://localhost:6379

# ─── Sesiones ───────────────────────────────────────────────────
JWT_ACCESS_SECRET=cambiar_en_produccion_32_bytes_min
JWT_REFRESH_SECRET=cambiar_en_produccion_32_bytes_min
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=30d

# ─── Almacenamiento S3 (MinIO local · MinIO o B2 en producción) ──
S3_ENDPOINT=http://localhost:9000
S3_REGION=us-east-1
S3_ACCESS_KEY=eterclack
S3_SECRET_KEY=dev_local_pwd
S3_FORCE_PATH_STYLE=true          # MinIO lo exige; B2/AWS no
S3_BUCKET_PHOTOS=eterclack-photos
S3_BUCKET_CONTRACTS=eterclack-contracts
S3_BUCKET_PUBLIC=eterclack-public
S3_UPLOAD_URL_TTL=300             # 5 min
S3_DOWNLOAD_URL_TTL=900           # 15 min

# ─── Correo ─────────────────────────────────────────────────────
# MAIL_TRANSPORT: mailpit | smtp | relay
MAIL_TRANSPORT=mailpit
SMTP_HOST=localhost
SMTP_PORT=1025
SMTP_USER=
SMTP_PASSWORD=
SMTP_SECURE=false
MAIL_FROM="EterClack <no-reply@eterclack.com>"
MAIL_REPLY_TO=hola@eterclack.com
MAIL_BOUNCE_ADDRESS=bounces@eterclack.com
MAIL_RATE_PER_MINUTE=4            # ← límite de Hostinger es 5/min; margen de 1

# ─── Wompi: recaudo ─────────────────────────────────────────────
WOMPI_BASE_URL=https://sandbox.wompi.co/v1
WOMPI_PUBLIC_KEY=pub_test_xxxxxxxxxxxxxxxx
WOMPI_PRIVATE_KEY=prv_test_xxxxxxxxxxxxxxxx
WOMPI_INTEGRITY_SECRET=test_integrity_xxxxxxxxxxxxxxxx
WOMPI_EVENTS_SECRET=test_events_xxxxxxxxxxxxxxxx
WOMPI_REDIRECT_URL=http://localhost:5173/pago/resultado

# ─── Wompi: dispersión (Pagos a Terceros) ───────────────────────
# Base URL a confirmar en la colección Postman / SwaggerHub durante S7
WOMPI_PAYOUTS_BASE_URL=
WOMPI_PAYOUTS_API_KEY=
WOMPI_PAYOUTS_USER_PRINCIPAL_ID=
WOMPI_PAYOUTS_ACCOUNT_ID=
PAYOUTS_ENABLED=false             # interruptor maestro
PAYOUTS_REQUIRE_ADMIN_APPROVAL=true

# ─── Reglas de negocio ──────────────────────────────────────────
PLATFORM_COMMISSION_BPS=1500      # 15,00 % en puntos base — enteros, nunca decimales
PAYOUT_HOLD_DAYS=5                # retención tras "entrega lista"
PAYOUT_MIN_AMOUNT_CENTS=5000000   # COP $50.000 mínimo por dispersión
PAYOUT_RUN_CRON=0 9 * * 3         # miércoles 9:00

# ─── Túnel para webhooks ────────────────────────────────────────
PUBLIC_WEBHOOK_URL=https://xxxx.ngrok-free.app
```

> **Regla de oro con el dinero:** todo monto viaja y se guarda como **entero en centavos**
> (`amount_in_cents: bigint`) y toda tasa como **puntos base** (`bps: int`). Nunca `float`, nunca
> `number` de JavaScript para pesos. `COP $50.000` es `5000000`. Una comisión del 15 % es `1500`.

---

## 4. Arranque

```bash
docker compose -f infra/compose/docker-compose.yml up -d
npm run db:migrate
npm run db:seed
npm run up                   # web :5173 · api :3000
```

| Interfaz | URL |
|---|---|
| Aplicación web | http://localhost:5173 |
| API | http://localhost:3000 |
| Documentación OpenAPI | http://localhost:3000/docs |
| Bandeja Mailpit | http://localhost:8025 |
| Consola MinIO | http://localhost:9001 |
| Previsualización de plantillas de correo | http://localhost:3000/dev/emails |

---

## 5. Datos semilla

`prisma/seed.ts` debe dejar el sistema en un estado desde el cual se puede probar cualquier flujo sin
hacer clic por toda la aplicación:

| Dato | Contenido |
|---|---|
| Usuarios | 1 admin, 3 fotógrafos (aprobado, pendiente, suspendido), 3 clientes — contraseña `Eterclack123*` |
| Catálogo | 8 especialidades (boda, retrato, producto, evento, familia, moda, inmobiliaria, gastronomía), 12 zonas de Colombia |
| Perfiles | Portafolios con 10 imágenes de muestra cada uno, subidas a MinIO por el propio seed |
| Paquetes | 3 por fotógrafo, con precio y límite de fotos seleccionables |
| Contrato | Plantilla v1 con variables `{{cliente}}`, `{{fotografo}}`, `{{fecha}}`, `{{valor}}` |
| Órdenes | Una por cada estado de la máquina, para probar transiciones y vistas |
| Pagos | Uno aprobado, uno rechazado, uno pendiente (con eventos Wompi simulados) |
| Libro | Saldos en `disponible`, `retenido` y `pagado`; una dispersión fallida para probar reintento |
| Configuración | Comisión, ventana de retención, mínimo de dispersión |

Imágenes de muestra: fotos libres de derechos en `prisma/seed-assets/`, comprimidas a menos de 200 KB
para no inflar el repositorio.

---

## 6. Webhooks de Wompi en local

Wompi necesita alcanzar la máquina desde internet. Sin esto, `transaction.updated` nunca llega y la
orden se queda en `pago_pendiente` para siempre.

```bash
ngrok http 3000
# → https://a1b2c3.ngrok-free.app
```

1. Copiar la URL a `PUBLIC_WEBHOOK_URL`.
2. Registrarla en el panel de Wompi como URL de eventos **de sandbox**:
   `https://a1b2c3.ngrok-free.app/api/webhooks/wompi`
3. Configurar URLs de eventos **separadas** para sandbox y producción. Nunca compartirlas.

> Con ngrok gratuito la URL cambia en cada reinicio. Vale la pena un dominio reservado, o usar
> `tailscale funnel`, que mantiene el hostname estable.

### 6.1 Falso Wompi para CI

El sandbox de Wompi es un servicio externo: se cae, cambia y no sirve para pruebas deterministas.
Desde S5 se construye `apps/api/test/wompi-mock/`, un servidor Fastify diminuto que implementa los
endpoints usados y **firma los eventos con el mismo algoritmo**. En CI, `WOMPI_BASE_URL` apunta ahí.

Esto permite probar sin conexión: aprobado, rechazado, pendiente que luego aprueba, webhook
duplicado, webhook con checksum inválido, webhook fuera de orden, y dispersión con ítem fallido.

---

## 7. Pruebas

| Nivel | Herramienta | Qué cubre |
|---|---|---|
| Unitarias | Vitest | Máquinas de estado, cálculo de comisión y saldos, firma de integridad, validación de checksum |
| Integración | Supertest + Testcontainers | Endpoints contra Postgres y Redis **reales** efímeros — no mocks |
| E2E | Playwright | Los tres roles de punta a punta |
| Carga | k6 | Subida concurrente de galerías, búsqueda con filtros |

### 7.1 Recorridos E2E obligatorios

1. **Cliente feliz:** registro → verificación por correo (leída desde la API de Mailpit) → búsqueda con filtros → solicitud → aceptar propuesta → aceptar contrato → pagar en sandbox → esperar webhook → ver galería → seleccionar → descargar.
2. **Fotógrafo:** postulación → aprobación admin → publicar perfil → bloquear fechas → recibir solicitud → proponer → crear galería → subir 20 fotos → publicar → revisar selección → marcar entrega lista → ver saldo → recibir dispersión.
3. **Admin:** aprobar fotógrafo → configurar comisión → ver orden y eventos → ejecutar corrida de dispersión → registrar un ajuste manual.
4. **Seguridad (deben fallar):** cliente A intenta abrir la galería de cliente B → 403. Enlace de descarga vencido → 403. Webhook con checksum inválido → 401 y **sin cambio de estado**. Webhook repetido → 200 y **sin efecto doble**.

> Las pruebas de correo leen la **API HTTP de Mailpit** (`http://localhost:8025/api/v1/messages`),
> no la bandeja visual. Así se asertan asunto, destinatario y enlaces sin intervención manual.

---

## 8. Qué **no** se puede validar en local

Honestidad sobre los límites de la Fase 1. Estos puntos quedan como riesgo abierto hasta la Fase 2 y
se atacan en S10–S11:

| No verificable en local | Se resuelve en |
|---|---|
| Entregabilidad real a Gmail, Outlook y Yahoo | S10 — mail-tester, cuentas reales, Google Postmaster Tools |
| Reputación de IP, PTR y listas negras | S10 — tras asignación de la IP del VPS |
| El límite de 5 correos/min de Hostinger | S10 — se **diseña** para él desde S4, se **verifica** en S10 |
| Renovación automática de certificados TLS | S9 — staging con dominio real |
| Rendimiento con disco lleno y volumen real | S11 — carga controlada en el piloto |
| Wompi con dinero real, tarifas y contracargos | S11 — piloto |
| Dispersión que llega efectivamente a un banco | S11 — primera dispersión real, monto pequeño, verificada manualmente |
