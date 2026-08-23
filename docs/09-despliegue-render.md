# 09 — Despliegue en Render (temporal)

**Render es un puente, no el destino.** La versión definitiva va a un VPS de Hostinger
([docs/06](06-despliegue-hostinger.md)). Esto sirve para tener una URL pública mientras tanto, con
lo mínimo por hacer a mano.

Todo lo que sigue está ya preparado en el repositorio: `Dockerfile`, `render.yaml` y el código que
sirve API y frontend desde un solo origen. **Tus pasos manuales están en §3.**

---

## 1. Cómo queda montado

```
                     Internet
                        │
              ┌─────────┴──────────┐
              │  eterclack.onrender.com  │  ← un solo origen
              └─────────┬──────────┘
                        │
        ┌───────────────┴────────────────┐
        │  Servicio web (Docker, gratis) │
        │                                │
        │   Fastify                      │
        │    ├─ /api/*   → la API        │
        │    ├─ /health  → salud         │
        │    └─ /*       → la SPA        │
        └───────────────┬────────────────┘
                        │
        ┌───────────────┴────────────────┐
        │  PostgreSQL gestionado (gratis)│
        └────────────────────────────────┘

        Externos, opcionales:
        · Bucket S3 (R2 o B2) para las fotos
        · Relay SMTP para los correos
```

### 1.1 Por qué un solo servicio y no dos

`onrender.com` está en la **Public Suffix List**. Eso significa que `api.onrender.com` y
`web.onrender.com` son **sitios distintos** para el navegador, no dos subdominios del mismo sitio.
Una cookie `SameSite=Lax` —la que usa la sesión— **no viajaría entre ellos**.

El síntoma sería desconcertante: el login responde 200, y la siguiente petición devuelve 401.

Las salidas eran dos: bajar la cookie a `SameSite=None` (más superficie de CSRF) o servir todo
desde un origen. Se eligió lo segundo: la cookie sigue siendo `Lax`, desaparece el CORS, y de paso
es un servicio en lugar de dos.

### 1.2 Lo que Render no puede dar

| Pieza | Situación en Render | Qué se hace |
|---|---|---|
| **Servidor de correo propio** | Imposible: no hay puerto 25 saliente | `MAIL_TRANSPORT=relay` con un proveedor externo |
| **Disco para las fotos** | El plan gratuito no tiene disco | Bucket S3 externo, o la app corre sin portafolios |
| **Base de datos permanente** | La gratuita **expira a los 30 días** | Renovar, o pasar al plan de pago |
| **Servicio siempre despierto** | Se duerme a los 15 min de inactividad | La primera visita tarda 30–60 s. Aceptable para una demo |

Ninguna de las cuatro es un problema en Hostinger. Por eso Render es temporal.

---

## 2. Lo que ya está hecho

| Archivo | Qué hace |
|---|---|
| `Dockerfile` | Compila web y API en una imagen. Usuario sin privilegios. Aplica migraciones al arrancar |
| `render.yaml` | Define el servicio y la base de datos. Genera los secretos de sesión solo |
| `apps/api/src/server.ts` | Sirve la SPA, con reserva para las rutas del cliente y caché correcta |
| `apps/api/src/env.ts` | S3 y Redis son opcionales: sin bucket la app arranca igual, solo sin fotos |

**Verificado antes de entregarlo:** la imagen se construyó y se ejecutó contra la base real. Se
comprobaron el health check, la SPA, las rutas del cliente, el 404 de API en JSON, las cabeceras de
caché, la sesión con cookie y una reserva completa de punta a punta.

---

## 3. Tus pasos manuales

### Paso 1 · Conectar el repositorio a Render *(5 min, obligatorio)*

1. Entra a **https://dashboard.render.com** con tu cuenta.
2. **New +** → **Blueprint**.
3. Conecta tu GitHub y elige **`AndresDFX/eterclack`**.
4. Render detecta `render.yaml` y muestra el servicio `eterclack` y la base `eterclack-db`.
5. Te pedirá los valores marcados como `sync: false`. **Puedes dejarlos vacíos por ahora** salvo
   los dos del paso 2 — la aplicación arranca igual.
6. **Apply**.

La primera construcción tarda entre 5 y 10 minutos (compila las dos apps).

### Paso 2 · Poner la URL real *(2 min, obligatorio)*

Hasta que Render no despliega, no se sabe el dominio. Cuando termine:

1. Copia la URL que te asignó, por ejemplo `https://eterclack.onrender.com`.
2. Ve a **Environment** del servicio y pon esa misma URL en:

| Variable | Valor |
|---|---|
| `WEB_URL` | `https://eterclack.onrender.com` |
| `API_URL` | `https://eterclack.onrender.com` |

3. **Save changes**. Render redespliega solo.

> Las dos apuntan al mismo sitio. No es un error: es la consecuencia de servir todo desde un origen.

### Paso 3 · Sembrar los datos de prueba *(2 min, obligatorio)*

Sin esto la plataforma está vacía: no hay fotógrafos, ni catálogo, ni cuentas.

1. En el servicio, abre la pestaña **Shell**.
2. Ejecuta:

```bash
npx tsx prisma/seed.ts
```

Deja 9 usuarios, 5 fotógrafos, 8 especialidades, 12 zonas, 15 productos y ~186 franjas de agenda.
Las credenciales están en el plan de pruebas funcionales.

> Si configuraste el bucket del paso 4, también sube unas 40 fotos de portafolio. Si no, corre
> igual y los perfiles se ven sin portafolio.

### Paso 4 · Bucket para las fotos *(10 min, opcional pero recomendado)*

Sin esto la plataforma funciona, pero un marketplace de fotografía sin fotos se ve a medio hacer.

**Con Cloudflare R2** (10 GB gratis, sin cargo por descarga):

1. Panel de Cloudflare → **R2** → **Create bucket** → nómbralo `eterclack-public`.
2. Crea otros dos: `eterclack-photos` y `eterclack-contracts`.
3. En `eterclack-public` → **Settings** → **Public access** → habilita el dominio `r2.dev`.
   Copia esa URL, algo como `https://pub-xxxxx.r2.dev`.
4. **Manage R2 API Tokens** → **Create API token** → permiso *Object Read & Write*.
   Guarda el Access Key ID, el Secret y el Account ID.
5. En Render → **Environment**, llena:

| Variable | Valor |
|---|---|
| `S3_ENDPOINT` | `https://<ACCOUNT_ID>.r2.cloudflarestorage.com` |
| `S3_PUBLIC_BASE_URL` | `https://pub-xxxxx.r2.dev` |
| `S3_ACCESS_KEY` | tu Access Key ID |
| `S3_SECRET_KEY` | tu Secret Access Key |

6. Guarda y vuelve a correr la semilla (paso 3) para que suba las fotos.

**Con Backblaze B2** es equivalente: bucket público, application key, y `S3_ENDPOINT` con la forma
`https://s3.<region>.backblazeb2.com`.

> `S3_FORCE_PATH_STYLE` ya está en `false` en el blueprint, que es lo que R2 y B2 esperan. MinIO
> en local sí necesita `true`, y por eso vive en `.env` y no aquí.

### Paso 5 · Correo *(10 min, opcional)*

Sin esto, los correos de verificación **no se envían** y no podrás verificar cuentas nuevas.
Las cuentas de la semilla ya vienen verificadas, así que puedes probar todo el flujo de reserva
sin correo.

**Con Brevo** (300 correos/día gratis):

1. Crea cuenta en brevo.com.
2. **SMTP & API** → **SMTP** → copia el servidor, el usuario y la clave.
3. En Render:

| Variable | Valor |
|---|---|
| `SMTP_HOST` | `smtp-relay.brevo.com` |
| `SMTP_USER` | el que te dio Brevo |
| `SMTP_PASSWORD` | la clave SMTP |
| `MAIL_FROM_ADDRESS` | un correo tuyo verificado en Brevo |
| `MAIL_REPLY_TO` | el mismo, o el de contacto |

Resend y SendGrid funcionan igual; solo cambian el host y las credenciales.

### Paso 6 · Wompi en sandbox *(5 min, opcional)*

Solo aplica cuando se construya la fase 6. Hoy el botón de pago está deshabilitado.

Cuando llegue: `WOMPI_PUBLIC_KEY`, `WOMPI_PRIVATE_KEY`, `WOMPI_INTEGRITY_SECRET` y
`WOMPI_EVENTS_SECRET` desde el panel de comercios, todas con prefijo de prueba.

> La aplicación **rechaza arrancar** si mezclas una URL de producción con llaves `pub_test_`.
> Es a propósito: ese error, descubierto en caliente, cuesta transacciones reales.

---

## 4. Comprobar que quedó bien

En este orden. Si uno falla, no sigas al siguiente.

| # | Comprobación | Cómo | Esperado |
|---|---|---|---|
| 1 | El servicio vive | `https://tu-app.onrender.com/health` | `{"status":"ok","db":"ok"}` |
| 2 | La web carga | Abre la raíz | La portada con la marca |
| 3 | Hay datos | Ve a «Fotógrafos» | 3 fotógrafos aprobados |
| 4 | Las rutas del cliente funcionan | Abre `/fotografos` directo, sin navegar | Carga la búsqueda, no un 404 |
| 5 | **La sesión persiste** | Ingresa y **recarga** | Sigues dentro |
| 6 | Se puede reservar | Recorre CP-25 del plan funcional | Orden creada |
| 7 | La PWA se instala | Chrome → menú → Instalar | Icono con la marca |

> El paso 5 es el que valida todo el diseño de un solo origen. Si al recargar te saca, algo pasó
> con las cookies.

---

## 5. Costo

| Concepto | Gratis | Si necesitas estabilidad |
|---|---|---|
| Servicio web | USD 0 · se duerme a los 15 min | Starter: **USD 7/mes**, siempre despierto |
| PostgreSQL | USD 0 · **expira a los 30 días** | Basic: **USD 6/mes**, permanente |
| Bucket R2 / B2 | USD 0 hasta 10 GB | ~USD 1,50/mes por 100 GB |
| Correo (Brevo) | USD 0 · 300/día | Desde USD 9/mes |
| **Total demo** | **USD 0** | **~USD 13/mes** |

Para comparar: el VPS de Hostinger cuesta unos **USD 15–20/mes** y ahí sí caben el correo propio,
el almacenamiento en disco y todo junto sin dormirse.

> ⚠ **Los 30 días de la base gratuita corren desde que la creas.** Cuando expire, los datos se
> borran tras 14 días de gracia. Si la demo tiene que durar más, pasa la base a `basic-256mb` antes
> de que venza, o ten presente que habrá que volver a sembrar.

---

## 6. Cuando toque pasar a Hostinger

La mudanza es corta porque nada quedó atado a Render:

| Pieza | En Render | En Hostinger | Cambio |
|---|---|---|---|
| Base de datos | PostgreSQL gestionado | PostgreSQL en Docker | `DATABASE_URL` |
| Fotos | R2 o B2 | MinIO en el VPS, o el mismo bucket | `S3_ENDPOINT`, o nada |
| Correo | Relay externo | Servidor propio | `MAIL_TRANSPORT=smtp` |
| Frontend | Servido por la API | Servido por Caddy, o igual | `SERVE_WEB` |
| Imagen | El mismo `Dockerfile` | El mismo `Dockerfile` | Ninguno |

**Todo son variables de entorno.** No hay código que reescribir: es exactamente la razón por la que
el almacenamiento habla S3 y el correo tiene un transporte intercambiable.

Los datos se llevan con un `pg_dump` de Render y un `pg_restore` en el VPS, y las fotos con
`rclone sync` entre buckets.

El detalle de la puesta en marcha del VPS está en [docs/06](06-despliegue-hostinger.md) y
[docs/08](08-plan-de-despliegue.md).
