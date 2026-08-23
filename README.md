# EterClack — Marketplace de servicios fotográficos

> *ETERnidad a un solo CLACK*

Plataforma web de dos caras: los clientes descubren y contratan fotógrafos; los fotógrafos gestionan
agenda, galerías y liquidaciones; administración controla aprobaciones, órdenes, recaudo y
dispersión de pagos.

---

## Arranque

Requisito único: **Docker Desktop**. Todo lo demás corre en contenedores.

```bash
cp .env.example .env      # solo la primera vez
npm run up                # construye y levanta todo
npm run db:migrate        # aplica el esquema
npm run db:seed           # datos de prueba
```

| Servicio | URL |
|---|---|
| **Aplicación web** | http://localhost:5173 |
| API | http://localhost:3000 |
| Salud de la API | http://localhost:3000/health |
| **Mailpit** (todos los correos caen aquí) | http://localhost:8025 |
| Consola MinIO | http://localhost:9001 |

### Credenciales de prueba

Todas con la contraseña `Eterclack123*`:

| Correo | Rol | Estado |
|---|---|---|
| `admin@eterclack.test` | Administración | — |
| `maria@eterclack.test` | Fotógrafo | Aprobado |
| `andres@eterclack.test` | Fotógrafo | Aprobado |
| `laura@eterclack.test` | Fotógrafo | Aprobado |
| `carlos@eterclack.test` | Fotógrafo | Pendiente de revisión |
| `sofia@eterclack.test` | Fotógrafo | Rechazado |
| `juliana@eterclack.test` | Cliente | — |

### Comandos

| Comando | Qué hace |
|---|---|
| `npm run up` | Construye y levanta el stack |
| `npm run down` | Detiene los contenedores |
| `npm run reset` | Borra volúmenes y vuelve a levantar desde cero |
| `npm run logs` | Sigue los logs de api y web |
| `npm run db:migrate` | Aplica migraciones de Prisma |
| `npm run db:seed` | Siembra datos de prueba |
| `npm run db:studio` | Abre Prisma Studio |
| `npm run typecheck` | Verifica tipos en ambas apps |

> **Puertos.** Postgres se publica en `55432` y Redis en `56379` para no chocar con instalaciones
> locales. Dentro de la red de Docker siguen siendo 5432 y 6379.

---

## Estado por fases

| Fase | Alcance | Estado |
|---|---|---|
| **0 · Fundaciones** | Monorepo, Docker Compose, Postgres, Redis, MinIO, Mailpit, esquema completo, semillas, sistema de diseño de marca | ✅ **Hecho** |
| **1 · Identidad** | Registro, verificación por correo, sesiones con refresh rotativo, recuperación de contraseña, RBAC por rol y recurso, auditoría, correos transaccionales | ✅ **Hecho** |
| **2 · Perfiles y descubrimiento** | Postulación de fotógrafo, aprobación/rechazo/suspensión por admin, perfiles, los tres productos, búsqueda con filtros | ✅ **Hecho** |
| **3 · Calendario y reserva directa** | El fotógrafo publica franjas; el cliente elige producto + fecha y reserva. Orden, contrato versionado con evidencia | ✅ **Hecho** |
| **4 · PWA** | Manifest, íconos de marca, service worker instalable y con modo sin conexión | ✅ **Hecho** |
| **5 · Galerías y entrega** | Subida directa a MinIO, miniaturas, selección con límite de producto, descargas firmadas | ⬜ Siguiente |
| **6 · Wompi recaudo** | Checkout Web, firma de integridad, webhook idempotente, conciliación | ⬜ |
| **7 · Wompi dispersión** | Libro contable, KYC bancario, corridas de pago, reintentos, conciliación | ⬜ |
| **8 · Servidor de correo** | `docker-mailserver`, DKIM, rebotes, lista de supresión | ⬜ |
| **9 · Hostinger** | VPS, DNS, TLS, MX, calentamiento de IP, producción | ⬜ |

### Cómo funciona la reserva

No hay negociación de precio. El modelo es deliberadamente cerrado:

1. El fotógrafo ofrece **tres productos**: económico, medio y premium. Ni uno más.
2. El fotógrafo **publica su calendario**: los días y jornadas en que puede trabajar.
   Sin franja publicada no hay cita posible.
3. El cliente elige **un producto + una franja libre** y reserva. El precio es el del producto.
4. La franja queda **retenida 24 horas** mientras el cliente acepta el contrato y paga.
   Si no lo hace, vuelve a quedar libre automáticamente.
5. Una jornada completa ocupa el día entero; mañana y tarde conviven como dos cupos.

### Lo que ya se puede probar

1. Entra a http://localhost:5173 y busca fotógrafos filtrando por especialidad, zona y presupuesto.
2. Crea una cuenta. El correo de verificación llega a http://localhost:8025 — ábrelo y confirma.
3. Abre un fotógrafo → **Solicitar fecha** → elige producto, día y franja → aparta la fecha.
4. En la orden, acepta el contrato: se guarda el texto exacto, tu nombre, la fecha, la hora y la IP.
5. Entra como `maria@eterclack.test` → **Calendario**: publica o retira días, y mira tus citas.
6. Entra como `admin@eterclack.test` y aprueba a Carlos Duarte, que está pendiente.
7. **Instala la app**: Chrome muestra el botón de instalación; queda como app independiente.

---

## Arquitectura

```
apps/
├─ api/                  Fastify 5 · Prisma 6 · PostgreSQL 16
│  ├─ prisma/            esquema, migraciones, semillas
│  └─ src/
│     ├─ lib/            crypto · money · mailer · plantillas · s3 · audit · slug · codes
│     ├─ plugins/        auth (JWT en cookies, RBAC)
│     └─ modules/        auth · catalog · photographers · slots · bookings · orders · admin
└─ web/                  React 19 · Vite 6 · Tailwind 4 · PWA
   ├─ public/            manifest, service worker, íconos de marca
   └─ src/
      ├─ styles/         brand.css — tokens de marca
      ├─ components/     Logo · Layout · Calendar · PanelNav · StatusBadge · AuthShell
      ├─ lib/            api · auth
      └─ pages/
```

### Reglas del código

- **El dinero es `BigInt` de centavos; las tasas son `Int` de puntos base.** Nunca punto flotante.
  `COP $50.000` es `5000000`; una comisión del 15 % es `1500`.
- **La autorización se verifica en el servidor y por recurso.** Ocultar un botón no es seguridad.
- **Toda transición de estado escribe en `audit_log`,** dentro de la misma transacción.
- **El contrato aceptado es inmutable:** se guarda el texto renderizado, no la plantilla.
- **La comisión se congela en la orden.** Cambiar la global no recalcula reservas ya hechas.
- **Reservar una franja es una carrera:** se resuelve con `updateMany … where status = DISPONIBLE`,
  nunca con leer-y-luego-escribir.
- **El service worker jamás cachea `/api`.** En reservas y pagos, un dato viejo es peor que ninguno.

---

## Marca

Extraída del logotipo oficial (`base/ETERCLACK - FOTO DE PERFIL-04.jpg`):

| Token | Valor | Uso |
|---|---|---|
| `--color-ink` | `#1D1D1B` | Fondo, carbón |
| `--color-bone` | `#E6E6E6` | Texto principal, blanco hueso |
| `--color-lime` | `#E7E226` | Acento único, amarillo lima |

Motivo gráfico: las **escuadras de visor** del logotipo, implementadas como `.clack-frame` y
`<ViewfinderCorners />`. Tipografía Archivo para títulos, Inter para texto. Formas de esquina recta:
la marca es geométrica, sin radios grandes. Todo vive en
[apps/web/src/styles/brand.css](apps/web/src/styles/brand.css).

---

## Documentación

| Documento | Contenido |
|---|---|
| [00 — Plan de implementación](docs/00-plan-implementacion.md) | Alcance, fases, hitos, impacto y riesgos |
| [01 — Arquitectura](docs/01-arquitectura.md) | Stack, mapeo Cloudflare → Hostinger, dimensionamiento |
| [02 — Entorno local](docs/02-entorno-local.md) | Compose, variables, semillas, pruebas |
| [03 — Servidor de correo](docs/03-servidor-correo.md) | DMS, DKIM/SPF/DMARC, entregabilidad |
| [04 — Wompi](docs/04-wompi.md) | Recaudo y dispersión a fotógrafos |
| [05 — Modelo de datos](docs/05-modelo-datos.md) | Entidades, estados, libro contable |
| [06 — Despliegue Hostinger](docs/06-despliegue-hostinger.md) | Provisión, DNS, cutover, operación |

### Cambios frente a la cotización original

| Tema | Cotización | Vigente |
|---|---|---|
| Infraestructura | Cloudflare Workers, D1, R2 | **Hostinger VPS** (dominio ya registrado ahí) |
| Correo | Proveedor transaccional externo | **Servidor propio** — alcance nuevo |
| Pagos | PayU WebCheckout, liquidación manual | **Wompi** Checkout Web + Pagos a Terceros — alcance nuevo |
