# EterClack — contexto para Claude Code

Marketplace de servicios fotográficos en Colombia. Dos caras: clientes reservan, fotógrafos
publican agenda y cobran, administración aprueba y controla.

**Idioma: todo en español.** Código, comentarios, mensajes de commit, textos de interfaz y
documentación. Los identificadores del dominio también (`franja`, `reserva`, `dispersión`).

---

## Arranque

```bash
cp .env.example .env      # solo la primera vez
npm run up                # construye y levanta todo
npm run db:migrate
npm run db:seed
```

| Servicio | URL |
|---|---|
| Web | http://localhost:5173 |
| API | http://localhost:3000 · `/health` |
| Mailpit (todos los correos caen aquí) | http://localhost:8025 |
| Consola MinIO | http://localhost:9001 |

Credenciales de prueba: contraseña `Eterclack123*` para
`admin@` · `maria@` (fotógrafa aprobada) · `carlos@` (pendiente) · `sofia@` (rechazada) ·
`juliana@` (cliente), todos `@eterclack.test`.

> **Puertos.** Postgres se publica en **55432** y Redis en **56379** en el host, para no chocar con
> instalaciones locales. Dentro de la red de Docker siguen siendo 5432 y 6379.

---

## Stack

**API** — Fastify 5 · Prisma 6 · PostgreSQL 16 · Redis · MinIO (S3) · Nodemailer
**Web** — React 19 · Vite 6 · Tailwind 4 · TanStack Query · React Router 7 · PWA
**Todo en Docker.** No hay pasos de instalación fuera de `npm run up`.

Decisiones que se tomaron al construir y difieren de lo que dice `docs/01`:

- **Fastify, no NestJS.** Misma estructura por módulos con mucho menos andamiaje.
- **scrypt, no Argon2id.** Ambos son memoria-dura y están aprobados por OWASP; scrypt viene en
  `node:crypto` y evita compilar binarios nativos en Alpine.
- **npm workspaces, no pnpm/Turborepo.** Sin herramientas extra.

---

## Reglas del código

Estas no son preferencias de estilo. Cada una existe porque hay una forma concreta de fallar.

### Dinero

**`BigInt` de centavos. Tasas en puntos base (`Int`). Nunca punto flotante.**
`COP $50.000` es `5000000n`. Una comisión del 15 % es `1500`.
Usa `lib/money.ts`; `splitAmount` garantiza que comisión + neto = total, exacto.

### Autorización

**Se verifica en el servidor y por recurso.** Ocultar un botón no es seguridad.
Un `GET /api/orders/:id` de una orden ajena devuelve **403**, no los datos.
El guard de rol (`requireRole`) es el piso, no el techo: además hay que comprobar propiedad.

### Estados

**Toda transición va dentro de una transacción y escribe en `audit_log`.**
Nunca un `UPDATE` suelto sobre una columna de estado.

### Concurrencia

**Reservar una franja es una carrera.** Se resuelve con
`updateMany({ where: { id, status: 'DISPONIBLE' } })` y comprobando `count === 0`.
Nunca leer-y-luego-escribir.

### Administración

**Un administrador no puede dejarse fuera.** No puede quitarse su propio rol, suspenderse ni
borrarse. Cambiar de rol a un fotógrafo con reservas está bloqueado: sus órdenes quedarían sin
dueño. Suspender o borrar revoca las sesiones abiertas en el mismo movimiento.

**El borrado es lógico.** Hay órdenes, contratos y auditoría que apuntan al usuario; un borrado
real rompería la trazabilidad que sostiene un contrato aceptado.

### Inmutabilidad

**El contrato aceptado no se toca.** Se guarda el texto **renderizado**, no la plantilla, junto con
nombre, fecha, hora, IP y navegador. Es la única forma de probar qué aceptó esa persona ese día.

**La comisión se congela en la orden.** Cambiar la global no recalcula reservas existentes.

### PWA

**El service worker nunca cachea `/api`.** En reservas y pagos, un dato viejo presentado como
actual es peor que un error visible.

### Responsive

Objetivos táctiles ≥ 44 px con puntero grueso, ≥ 24 px con ratón (WCAG 2.5.8). Se logra con
`@media (pointer: coarse)` en `brand.css`: crece el área, no la tipografía. Los enlaces embebidos
en una frase quedan exentos — WCAG los excluye y agrandarlos deformaría el texto.

---

## Modelo de negocio

El flujo es **deliberadamente cerrado**. No hay negociación.

1. El fotógrafo ofrece **tres productos**: `ECONOMICO`, `MEDIO`, `ALTO`. Restricción única por
   fotógrafo — no puede haber un cuarto.
2. El fotógrafo **publica franjas** en su calendario (`AvailabilitySlot`): mañana, tarde o jornada
   completa. **Sin franja publicada no hay cita posible.**
3. El cliente elige **un producto + una franja libre** y reserva. El precio es el del producto.
4. La franja queda **retenida 24 h** mientras acepta el contrato y paga. Si no, vuelve a quedar libre.
5. Una jornada completa ocupa el día entero; mañana y tarde conviven como dos cupos.

Estados de la orden:
`BORRADOR → CONTRATO_ACEPTADO → PAGO_PENDIENTE → RESERVADA → EN_PRODUCCION → SELECCION →
ENTREGA_LISTA → COMPLETADA` (o `CANCELADA`).

---

## Estructura

```
apps/
├─ api/          Fastify · Prisma · PostgreSQL
│  ├─ prisma/    esquema, migraciones, semillas (incluye descarga de fotos)
│  └─ src/
│     ├─ lib/       crypto · money · mailer · templates · s3 · audit · slug · codes
│     ├─ plugins/   auth (JWT en cookies httpOnly, RBAC)
│     └─ modules/   auth · catalog · photographers · slots · bookings · orders · users · admin
└─ web/          React · Vite · Tailwind · PWA
   ├─ public/    manifest, service worker, íconos
   └─ src/
      ├─ styles/     brand.css — todos los tokens de marca
      ├─ components/ Logo · Layout · Calendar · PanelNav · StatusBadge · AuthShell
      └─ pages/

docs/            9 documentos: plan, arquitectura, correo, Wompi, datos, pruebas, despliegue
site/            generador del sitio estático de documentación
base/            identidad visual (los PDFs de la cotización NO se versionan: son confidenciales)
```

---

## Marca

Extraída del logotipo (`base/ETERCLACK - FOTO DE PERFIL-04.jpg`), colores muestreados del archivo:

| Token | Valor |
|---|---|
| `--color-ink` | `#1D1D1B` carbón, fondo |
| `--color-bone` | `#E6E6E6` blanco hueso, texto |
| `--color-lime` | `#E7E226` amarillo lima, acento único |

Motivo gráfico: las **escuadras de visor** del logotipo → `.clack-frame` y `<ViewfinderCorners />`.
Tipografía Archivo (títulos) e Inter (texto), desde Google Fonts.
Esquinas rectas: la marca es geométrica, sin radios grandes.

**Todo vive en `apps/web/src/styles/brand.css`.** No pongas colores literales en los componentes.

---

## Estado

| Fase | Estado |
|---|---|
| 0 Fundaciones · 1 Identidad · 2 Descubrimiento · 3 Calendario y reserva · 4 Contrato y PWA · Gestión de usuarios | ✅ Hecho |
| 5 Galerías y entrega | ⬜ Siguiente |
| 6 Wompi recaudo · 7 Wompi dispersión · 8 Correo propio · 9 Hostinger | ⬜ |

**El hueco principal: no hay pruebas automatizadas.** Todo se verificó a mano contra la API real.
El plan está escrito en `docs/07`; el primer paso al retomar es convertir esas verificaciones en
pruebas de integración.

---

## Trabajando en este repositorio

- Antes de dar algo por bueno, **pruébalo contra la API en ejecución**, no lo asumas.
  `docker compose exec -T api npx tsc --noEmit` y `docker compose exec -T web npx tsc -b`.
- Los cambios en `apps/api/src` recargan solos (`CHOKIDAR_USEPOLLING` está activo: los bind mounts
  de Windows no emiten eventos de archivo).
- Si tocas el esquema: `npm run db:migrate`, y revisa que la semilla siga corriendo.
- Nunca subas `.env` ni los PDFs de `base/`.

---

## Enlaces

- Repositorio: https://github.com/AndresDFX/eterclack
- Documentación publicada: https://andresdfx.github.io/eterclack/
- Los flujos de CI están en `.github/workflows/` pero **no versionados**: el token de `gh` no tiene
  el permiso `workflow`. Para habilitarlos: `gh auth refresh -s workflow`, quitar la línea
  `.github/workflows/` de `.gitignore` y hacer commit.
