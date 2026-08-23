# 01 — Arquitectura: de Cloudflare a Hostinger

## 1. El cambio en una tabla

La cotización diseñó todo alrededor del ecosistema serverless de Cloudflare. Hostinger es un VPS:
una máquina Linux. El reemplazo no es pieza por pieza equivalente, es un cambio de modelo — de
funciones efímeras en el borde a procesos persistentes en un servidor.

| Capa | Cotización (Cloudflare) | Plan vigente (Hostinger VPS) | Nota |
|---|---|---|---|
| Web | Workers/Pages + assets estáticos | Build de Vite servido por Caddy | Sin CDN global; Caddy cachea y comprime |
| API | Cloudflare Workers | Node.js 22 + Fastify en contenedor | Sin límite de CPU-time; procesos largos permitidos |
| Datos | Cloudflare D1 (SQLite) | **PostgreSQL 16** | Transacciones reales, tipos ricos, `SELECT … FOR UPDATE` para el libro contable |
| Archivos | Cloudflare R2 | **MinIO** (S3-compatible) en volumen del VPS | Mismo SDK S3, mismas URLs firmadas, migrable a B2/Wasabi sin tocar código |
| Asíncrono | Queues + Cron Triggers | **BullMQ + Redis 7** | Reintentos, backoff, prioridades, tareas programadas |
| Seguridad de borde | WAF, rate limits, Turnstile | Caddy rate-limit + CrowdSec + fail2ban + UFW + Altcha | Se pierde el escudo DDoS de Cloudflare |
| Observabilidad | Logs y Analytics | Prometheus + Loki + Grafana + Uptime Kuma | Autogestionado |
| Correo | Proveedor transaccional externo | **Servidor propio** (`docker-mailserver`) | Alcance nuevo — ver [03](03-servidor-correo.md) |
| TLS y DNS | Cloudflare | DNS en hPanel + Caddy con Let's Encrypt | El dominio **ya está** en Hostinger: no hay que mover nameservers |
| Pagos | PayU WebCheckout | **Wompi** Checkout Web + Pagos a Terceros | Ver [04](04-wompi.md) |

### 1.1 Lo que se gana

- **No hay que mover los nameservers.** La cotización dedicaba una sección entera a migrar la zona
  DNS de Hostinger a Cloudflare, con el riesgo de romper MX/SPF/DKIM en el camino. Ese riesgo
  desaparece: la zona se queda donde está.
- **Se puede correr un servidor de correo.** Cloudflare Workers no puede abrir conexiones SMTP
  salientes en el puerto 25. Sin VPS, el requisito de servidor propio era simplemente imposible.
- Postgres en lugar de SQLite: el libro contable de dispersión necesita transacciones y bloqueo de
  filas de verdad.
- Costo mensual único y predecible en lugar de cinco servicios medidos por uso.
- Sin bloqueo de proveedor en D1 ni R2.

### 1.2 Lo que se pierde, y cómo se compensa

| Se pierde | Compensación |
|---|---|
| CDN global en 300+ ciudades | Público objetivo colombiano; un VPS en la región de EE. UU./Brasil da latencia aceptable. Caddy con `Cache-Control` largo en assets con hash y miniaturas |
| Mitigación de DDoS | Límites de tasa en Caddy, CrowdSec, UFW. Si aparece un ataque real, Cloudflare se puede poner **delante** como proxy sin abandonar Hostinger |
| Egreso gratis de R2 | El VPS incluye ancho de banda (varios TB/mes). Vigilar consumo cuando crezcan las descargas de galerías |
| Escalado automático | Escalado vertical manual (subir de plan). Suficiente para el MVP; un segundo nodo exige balanceador y sesiones compartidas — fuera de alcance |
| TLS y backups administrados | Caddy renueva certificados solo; los backups los hacemos nosotros con `restic` |
| Cero mantenimiento de servidor | Parches, monitoreo y guardias pasan a ser trabajo recurrente. **Esto cambia el plan de mantenimiento posventa de la cotización** |

---

## 2. Topología

```
                      Internet
                          │
              ┌───────────┴────────────┐
              │  DNS: hPanel Hostinger │
              └───────────┬────────────┘
                          │
        ┌─────────────────┴──────────────────┐
        │      VPS Hostinger (KVM, Ubuntu)   │
        │                                    │
        │   ┌──────────────────────────┐     │
        │   │  Caddy (443/80)          │     │ ← TLS automático, rate limit
        │   │  eterclack.com  → web    │     │
        │   │  api.eterclack.com → api │     │
        │   │  cdn.eterclack.com → minio│    │
        │   └──────┬────────┬──────────┘     │
        │          │        │                │
        │      ┌───▼───┐ ┌──▼────┐           │
        │      │  web  │ │  api  │           │
        │      │ Vite  │ │Fastify│           │
        │      └───────┘ └──┬────┘           │
        │                   │                │
        │   ┌───────┬───────┼────────┬─────┐ │
        │   │       │       │        │     │ │
        │ ┌─▼──┐ ┌──▼──┐ ┌──▼───┐ ┌──▼──┐  │ │
        │ │ PG │ │Redis│ │MinIO │ │ MTA │  │ │
        │ │ 16 │ │  7  │ │  S3  │ │ DMS │  │ │ ← 25/465/587/993
        │ └────┘ └──┬──┘ └──────┘ └─────┘  │ │
        │           │                       │ │
        │      ┌────▼─────┐                 │ │
        │      │ workers  │ miniaturas,     │ │
        │      │ BullMQ   │ correo, payouts,│ │
        │      └──────────┘ limpieza        │ │
        └────────────────────────────────────┘
                          │
          ┌───────────────┴────────────────┐
          │  Wompi API (recaudo + payouts) │
          └────────────────────────────────┘
```

---

## 3. Stack

| Área | Elección | Por qué |
|---|---|---|
| Monorepo | **npm workspaces** | Sin herramientas extra: `npm install` en la raíz resuelve las dos apps. Turborepo se añade solo si los tiempos de build lo justifican |
| Frontend | React 19 + Vite 6 + TypeScript + **Tailwind 4** | Tailwind 4 configura el tema en CSS (`@theme`), así que los tokens de marca viven en un solo archivo: `apps/web/src/styles/brand.css` |
| Estado servidor | TanStack Query | Caché, reintentos y estados de carga sin escribirlos a mano |
| Formularios | Estado controlado + Zod en el servidor | El servidor es la autoridad de validación; el cliente muestra los `issues` que devuelve la API |
| Backend | **Fastify 5** (Node 22) + Zod | Se eligió sobre NestJS al construir: mismo orden por módulos con una fracción del andamiaje, y los esquemas Zod validan una sola vez para servidor y cliente |
| ORM | Prisma 6 | Migraciones versionadas, tipos generados, buen soporte para transacciones |
| Base de datos | PostgreSQL 16 | Ver §1.1 |
| Colas | BullMQ + Redis 7 | Reintentos con backoff, **rate limiting nativo** (crítico por el límite de correo) |
| Archivos | MinIO + AWS SDK v3 | URLs prefirmadas para subida directa navegador → almacenamiento |
| Imágenes | sharp en worker | Miniaturas y validación real de tipo (magic bytes, no extensión) |
| Correo | Nodemailer → MTA propio · Mailpit en local | Ver [03](03-servidor-correo.md) |
| Plantillas correo | React Email + versión texto plano | Mismo lenguaje que el resto; previsualización en `/dev/emails` |
| Pagos | SDK propio sobre la API de Wompi | Ver [04](04-wompi.md) |
| PDF de contratos | Puppeteer o `pdf-lib` en worker | Contrato congelado y descargable |
| Auth | JWT en cookies `httpOnly` + `SameSite=Lax`, refresh rotativo, **scrypt** | Sesiones revocables sin dependencia externa. scrypt (node:crypto) en vez de Argon2id: es memoria-dura y aprobado por OWASP, y evita compilar binarios nativos en alpine — un `docker compose up` que nunca falla por toolchain |
| Pruebas | Vitest · Supertest + Testcontainers · Playwright | Unitarias, integración con Postgres real, E2E por rol |
| Proxy | Caddy 2 | TLS automático; configuración de 20 líneas frente a 200 de nginx+certbot |
| CI/CD | GitHub Actions → GHCR → SSH + compose | Ver [06](06-despliegue-hostinger.md) |

### 3.1 Estructura del repositorio

```
eterclack/
├─ apps/
│  ├─ web/                  # React + Vite
│  └─ api/                  # Fastify
│     └─ src/modules/
│        ├─ auth/           # registro, sesión, verificación, recuperación
│        ├─ users/          # perfiles, roles
│        ├─ photographers/  # postulación, aprobación, portafolio, agenda
│        ├─ catalog/        # especialidades, zonas, paquetes
│        ├─ search/         # descubrimiento y filtros
│        ├─ requests/       # solicitudes y propuestas
│        ├─ orders/         # órdenes y máquina de estados
│        ├─ contracts/      # versionado, aceptación, evidencia, PDF
│        ├─ payments/       # Wompi recaudo
│        ├─ ledger/         # libro contable, comisión, saldos
│        ├─ payouts/        # Wompi dispersión
│        ├─ galleries/      # galerías, fotos, miniaturas
│        ├─ selections/     # favoritos, selección final, comentarios
│        ├─ deliveries/     # entrega y descargas firmadas
│        ├─ mail/           # cola, plantillas, rebotes, supresión
│        ├─ admin/          # dashboard y operación
│        └─ audit/          # bitácora de eventos críticos
├─ packages/
│  ├─ shared/               # esquemas Zod, tipos, máquinas de estado
│  └─ config/               # eslint, tsconfig, prettier
├─ infra/
│  ├─ compose/              # docker-compose por entorno
│  ├─ caddy/                # Caddyfile
│  ├─ mailserver/           # config de docker-mailserver
│  └─ scripts/              # backup, restore, warmup
└─ docs/
```

---

## 4. Almacenamiento de fotografías

El diseño de la cotización se conserva **tal cual** — solo cambia el destino:

- **Subida directa navegador → MinIO** con URL prefirmada de corta duración (5 min). Los archivos
  nunca pasan por la memoria de la API.
- Buckets **privados**, sin listado público. Claves de objeto no predecibles (UUID v7 + hash), con
  separación por proyecto: `projects/{orderId}/originals/{uuid}.jpg`.
- Tres derivados: `thumb` (400 px), `preview` (1600 px con marca de agua) y `original`/`final`.
- Descargas por URL firmada de 15 minutos, **emitida solo tras verificar propiedad del recurso en el
  servidor**.
- Cuotas por fotógrafo y por proyecto; límites de tipo y tamaño configurables.
- Retención sugerida: 90 días después de completar la orden, luego archivo o eliminación previa
  notificación. La decisión final es de EterClack.

### 4.1 El disco es la restricción real

Aquí está el costo escondido de salir de R2. R2 cobra ~USD 0,015/GB-mes con egreso gratis; el NVMe
de un VPS es una cantidad fija que se acaba.

| Plan | Disco | Fotos aprox. (5 MB c/u, con derivados ≈ 7 MB) |
|---|---|---|
| KVM 2 (100 GB) | ~70 GB útiles para fotos | ~10.000 fotos |
| KVM 4 (200 GB) | ~160 GB útiles | ~23.000 fotos |

Con 3 fotógrafos activos entregando 300 fotos por proyecto, el KVM 2 se llena en unos 30 proyectos.

**Plan de salida, decidido desde ahora:** el cliente S3 se configura por variables de entorno. El
día que el disco apriete, se apunta `S3_ENDPOINT` a **Backblaze B2** (~USD 6/TB-mes, egreso gratis
hacia Cloudflare y generoso en general) y se migran los objetos con `rclone`. **Cero cambios de
código.** Es la razón por la que se elige MinIO y no el sistema de archivos local.

### 4.2 Dimensionamiento recomendado

| Opción | Composición | Costo aprox. | Cuándo |
|---|---|---|---|
| **A — un VPS** | KVM 4 (4 vCPU / 16 GB / 200 GB) con todo, correo incluido | ~USD 15–20/mes | Recomendada para el MVP y el piloto |
| **B — dos VPS** | KVM 4 para la app + KVM 1 solo para correo | ~USD 22–27/mes | Mejor práctica: aísla la reputación de la IP de correo y reduce el radio de impacto de un reinicio |

> Empezar con **A** y separar el correo a un segundo VPS si la entregabilidad da problemas o si el
> volumen crece. La configuración del MTA vive en `infra/mailserver/`, así que mudarlo es mover un
> directorio y cambiar dos registros DNS.

Verificar planes y precios vigentes en el panel de Hostinger antes de contratar.

---

## 5. Seguridad

Se conservan todos los controles de la cotización, reimplementados sin Cloudflare:

| Control | Implementación |
|---|---|
| Contraseñas | scrypt (N=2^16, r=8, p=1), política mínima, sin límite superior de longitud |
| Sesiones | JWT corto (15 min) en cookie `httpOnly` + refresh rotativo (30 d) revocable en base |
| Autorización | `requireRole()` de Fastify por rol **y** verificación de propiedad por recurso en cada operación |
| Archivos | Validación por magic bytes, límite de tamaño, reescritura del nombre, sin ejecución |
| Límites de tasa | Caddy (global por IP) + BullMQ/Redis (por usuario en operaciones costosas) |
| Bots en formularios | Altcha (proof-of-work, sin dependencia de terceros) o hCaptcha |
| Secretos | Fuera del repositorio; `.env` en el servidor con permisos 600; `.env.example` versionado |
| Entornos | `local` / `staging` / `production` separados, con credenciales Wompi distintas |
| Auditoría | Tabla `audit_log` en cada cambio de estado, contrato, pago, publicación y dispersión |
| Cabeceras | HSTS, CSP, `X-Content-Type-Options`, `Referrer-Policy` desde Caddy |
| Servidor | UFW (solo 22, 80, 443 y puertos de correo), SSH solo con llave, fail2ban, `unattended-upgrades` |

> Los textos y procesos de tratamiento de datos, derechos de imagen, menores, retención y
> eliminación deben ser validados por la asesoría jurídica del cliente. No los suple la
> implementación técnica.

---

## 6. Costos recurrentes (orientativos, fuera de los COP $7.000.000)

| Concepto | Antes (Cloudflare) | Ahora (Hostinger) | Qué hace crecer el costo |
|---|---|---|---|
| Cómputo + datos + archivos | Workers + D1 + R2 medidos por uso | VPS KVM: ~USD 15–20/mes fijo | Subir de plan al crecer |
| Correo | Proveedor transaccional: ~USD 0–20/mes | **USD 0** (incluido en el VPS) | Reemplazado por trabajo operativo |
| Dominio | Renovación en Hostinger | Igual | Tarifa anual |
| Pasarela | PayU | **Wompi**: comisión por transacción + tarifa por dispersión | Volumen, método de pago, impuestos, contracargos |
| Backups externos | — | Backblaze B2: ~USD 1–6/mes | Volumen retenido |
| **Operación** | Casi nula | **Real: parches, monitoreo, incidentes** | Ver nota |

> **Nota sobre mantenimiento.** Los planes posventa de la cotización (COP $350.000 y $650.000/mes)
> se dimensionaron para una infraestructura administrada por Cloudflare. Con VPS propio y servidor
> de correo, el trabajo recurrente sube: parches de seguridad, monitoreo de disco, vigilancia de
> listas negras de correo y respuesta a incidentes. **Estos planes deben revisarse antes de firmar
> el soporte.**

Verificar tarifas de Wompi, Hostinger y Backblaze en sus paneles antes de contratar; están sujetas a
cambio.

---

## 7. Fuentes

- Wompi — Ambientes y llaves: https://docs.wompi.co/docs/colombia/ambientes-y-llaves/
- Wompi — Pagos a Terceros: https://docs.wompi.co/en/docs/colombia/introduccion-pagos-a-terceros/
- Hostinger — Puerto SMTP 25 en VPS: https://www.hostinger.com/support/7854530-is-smtp-port-25-blocked-on-hostinger-vps/

Consulta realizada el 22 de agosto de 2026.
