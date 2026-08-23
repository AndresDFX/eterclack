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
| `apps/api/src/env.ts` | Trata una variable vacía como no definida, y toma la URL de `RENDER_EXTERNAL_URL` |
| `apps/api/prisma/sembrar-si-vacia.ts` | Siembra en segundo plano tras abrir el puerto, solo si la base está vacía |

**Verificado antes de entregarlo**, construyendo la imagen y ejecutándola:

- Arranque con las diez variables opcionales **en blanco**, como las deja Render.
- Arranque en frío contra una base **vacía**: migró, sembró y sirvió sin intervención.
- Segundo arranque: detectó los datos y **no** volvió a sembrar.
- Escucha en `0.0.0.0` y en el `PORT` que inyecta Render.
- **Puerto abierto en 6 segundos** en arranque en frío. El sembrado ya no lo bloquea.
- **Con la base inalcanzable**: el contenedor sigue vivo, `/health` responde 200, la web se sirve,
  `/health/db` devuelve 503 y el error real (`P1001`) queda en los logs. Antes el contenedor moría
  antes de abrir puerto y el proveedor solo reportaba «no open ports», sin pista de la causa.
- Health check, SPA, rutas del cliente, 404 de API en JSON, cabeceras de caché, sesión con cookie
  y una reserva completa de punta a punta.

---

## 3. Tus pasos manuales

### Paso 1 · Conectar el repositorio a Render *(5 min, obligatorio)*

1. Entra a **https://dashboard.render.com** con tu cuenta.
2. **New +** → **Blueprint**.
3. Conecta tu GitHub y elige **`AndresDFX/eterclack`**.
4. Render detecta `render.yaml` y muestra el servicio `eterclack` y la base `eterclack-db`.
5. Te pedirá los valores marcados como `sync: false` (bucket, correo, Wompi).
   **Déjalos todos vacíos.** La aplicación arranca igual: sin bucket los perfiles se ven sin
   portafolio, y sin correo no se envían verificaciones — pero las cuentas de prueba ya vienen
   verificadas.
6. **Apply**.

> Una variable en blanco se trata como no definida y se usa su valor por defecto. Esto está
> probado: la imagen arranca con las diez variables opcionales vacías.

### Paso 2 · Esperar y comprobar *(nada que hacer)*

El primer build tarda entre 5 y 10 minutos: compila las dos aplicaciones. Cuando termine, al
arrancar el contenedor ocurre esto solo, en orden:

1. Aplica las migraciones de la base.
2. **Siembra los datos de prueba**, pero solo si la base está vacía.
3. Levanta el servidor.

No hay que ejecutar ningún comando a mano. La pestaña **Shell** de Render **es de pago**: en el
plan gratuito no existe, y por eso el sembrado va en el arranque.

La URL tampoco hay que configurarla: Render publica `RENDER_EXTERNAL_URL` con el dominio del
servicio, y la aplicación la toma de ahí para `WEB_URL` y `API_URL`.

> Si alguna vez quieres dejar de sembrar (por ejemplo, con datos reales ya cargados), pon
> `SEED_ON_START` en `false` desde **Environment**.

### Paso 3 · Ver la URL *(30 segundos)*

**La URL no está en la pestaña «Syncs» del Blueprint.** Ahí solo se ve si el blueprint se
sincronizó con el repositorio, que es otra cosa.

1. En el menú de la izquierda del Blueprint, pulsa **Resources**.
2. Verás dos recursos: **`eterclack`** (el servicio web) y **`eterclack-db`** (la base).
3. Pulsa **`eterclack`**.
4. La URL aparece **arriba, bajo el nombre del servicio**, con forma
   `https://eterclack.onrender.com`. Es un enlace: se puede pulsar y copiar.

Junto al nombre está el estado del servicio. Esto es lo que significa cada uno:

| Estado | Qué pasa | Qué hacer |
|---|---|---|
| **Building** | Compilando la imagen | Esperar. El primero tarda 5–10 min |
| **Deploying** | Arrancando el contenedor | Esperar |
| **Live** | Funcionando | Abrir la URL |
| **Deploy failed** | El build o el arranque falló | Abrir **Logs** y leer el final |
| **Suspended** | Sin horas gratuitas o suspendido a mano | Revisar el uso del plan |

> Mientras el estado no sea **Live**, la URL existe pero devuelve un error de Render. No es un
> fallo de la aplicación.

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

6. Guarda. Render redespliega solo.
7. Para que la semilla suba las fotos hace falta que vuelva a correr sobre una base vacía. Lo más
   simple: en **eterclack-db** pulsa los tres puntos → **Reset database**, y en el servicio web
   **Manual Deploy** → **Deploy latest commit**. Volverá a migrar y sembrar, ahora con fotos.

**Con Backblaze B2** es equivalente: bucket público, application key, y `S3_ENDPOINT` con la forma
`https://s3.<region>.backblazeb2.com`.

> `S3_FORCE_PATH_STYLE` ya está en `false` en el blueprint, que es lo que R2 y B2 esperan. MinIO
> en local sí necesita `true`, y por eso vive en `.env` y no aquí.

### Paso 5 · Correo *(no funciona en el plan gratuito)*

**El plan gratuito de Render bloquea la salida por los puertos 25, 465 y 587.** Es política del
proveedor, no configuración: *«Free web services can't send outbound network traffic on ports 25,
465, or 587, commonly used for SMTP.»* Ningún relay SMTP funciona ahí — ni Brevo, ni Resend, ni
SendGrid. Los envíos fallan en silencio.

Consecuencia práctica: **no se pueden verificar cuentas nuevas** en Render gratuito.

Y no es un obstáculo para probar: **las siete cuentas de la semilla ya vienen verificadas**, así
que el recorrido completo —buscar, reservar, aceptar contrato, panel del fotógrafo,
administración— se puede hacer entero sin correo.

Si necesitas correo, hay dos caminos:

| Camino | Qué implica |
|---|---|
| Subir a un plan de pago (USD 7/mes) | Se desbloquean los puertos SMTP y basta con llenar `SMTP_HOST`, `SMTP_USER` y `SMTP_PASSWORD` |
| Integrar la API HTTP del proveedor | Resend, Brevo y SendGrid tienen REST sobre el puerto 443, que sí sale. Requiere añadir un transporte nuevo al módulo `mail` — trabajo de desarrollo, no de configuración |

> En Hostinger esto no aplica: el puerto 25 está abierto y el plan contempla servidor de correo
> propio ([docs/03](03-servidor-correo.md)).

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
| 1 | El servicio vive | `.../health` | `{"status":"ok","service":"eterclack-api"}` |
| 1b | La base responde | `.../health/db` | `{"status":"ok","db":"ok"}`. Si da 503, la base falla pero el servicio sigue en pie: mira los logs |
| 2 | La web carga | Abre la raíz | La portada con la marca |
| 3 | Se sembró sola | Ve a «Fotógrafos» | 3 fotógrafos aprobados. Si sale vacío, mira los logs: la semilla deja rastro |
| 4 | Las rutas del cliente funcionan | Abre `/fotografos` directo, sin navegar | Carga la búsqueda, no un 404 |
| 5 | **La sesión persiste** | Ingresa y **recarga** | Sigues dentro |
| 6 | Se puede reservar | Recorre CP-25 del plan funcional | Orden creada |
| 7 | La PWA se instala | Chrome → menú → Instalar | Icono con la marca |

> El paso 5 es el que valida todo el diseño de un solo origen. Si al recargar te saca, algo pasó
> con las cookies.

---

## 4.1 Si algo falla

| En los logs | Qué pasa | Arreglo |
|---|---|---|
| `Port scan timeout reached, no open ports detected` | El proceso murió antes de escuchar | Mira las líneas anteriores: casi siempre es validación de entorno |
| `✗ La aplicación no puede arrancar: variables de entorno inválidas` | Falta o sobra una variable | El mensaje dice cuál. Una variable en blanco cuenta como no definida |
| `· DATABASE_URL: String must contain at least 1 character(s)` | La base no se creó o no se enlazó | Render permite **una sola** Postgres gratuita por workspace. Si ya tenías otra, bórrala o cambia `plan` a `basic-256mb` |
| `migracion fallida, reintento N/5` seguido de `P1001` | La base no responde | El servicio arranca igual. Revisa que `eterclack-db` esté **Available** |
| `/health/db` devuelve 503 | La app vive, la base no | Mismo caso anterior |
| El servicio queda en «Deploying» y acaba cancelado | El health check nunca pasó | No debería ocurrir: `/health` ya no consulta la base |

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
