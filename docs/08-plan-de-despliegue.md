# 08 — Plan de despliegue

**Estado hoy:** todo corre en Docker local. Nada está publicado.
**Destino:** VPS de Hostinger, donde ya está el dominio.

---

## 1. Lo primero: GitHub Pages no puede alojar esta plataforma

Conviene decirlo antes de planear nada, porque cambia la ruta entera.

GitHub Pages sirve **archivos estáticos**. Esta plataforma necesita, como mínimo:

| Pieza | Por qué Pages no la sirve |
|---|---|
| API en Node (Fastify) | Pages no ejecuta código de servidor |
| PostgreSQL | No hay base de datos |
| Redis y colas | No hay procesos persistentes |
| MinIO / almacenamiento de fotos | No hay almacenamiento de objetos ni URLs firmadas |
| Sesiones con cookies `httpOnly` | Requieren un servidor que las emita y valide |
| Webhooks de Wompi | Necesitan un endpoint que reciba POST |
| Servidor de correo | Necesita puertos SMTP |

Publicar solo el frontend en Pages daría una página que carga y **falla en la primera petición**:
sin catálogo, sin fotógrafos, sin login. Peor que no publicar nada, porque parece roto.

### 1.1 Lo que Pages **sí** resuelve, y bien

Un sitio público con la **documentación y la hoja de contacto visual**: URL para compartir con el
cliente hoy mismo, sin infraestructura, sin costo. Eso es lo que se configura en §2.

### 1.2 Alternativas si se quiere la app pública antes del VPS

| Opción | Qué implica | Veredicto |
|---|---|---|
| **Hostinger VPS** (el plan) | ~USD 15–20/mes, todo en una máquina, correo propio posible | **Recomendada.** Es el destino real |
| Frontend en Pages + API en Render/Fly/Railway | Gratis o casi, pero parte la app en dos proveedores, CORS entre dominios, la capa gratuita se duerme, y el correo propio sigue siendo imposible | Solo para una demo temporal |
| Todo en Render/Railway | Un proveedor, despliegue simple | Costo similar al VPS con menos control y sin correo propio |

> Si la meta es **enseñar el producto ya**, el sitio de Pages con la hoja de contacto lo logra hoy.
> Si la meta es **que alguien lo use**, el camino es el VPS.

---

## 2. Fase A — Repositorio y sitio público (hoy, sin costo)

### 2.1 Repositorio

```bash
git init -b main
git add -A
git commit -m "…"
gh repo create eterclack --private --source=. --push
```

**Qué NO se sube:**

| Archivo | Motivo |
|---|---|
| `.env` | Secretos. Solo se versiona `.env.example` |
| `base/*.pdf` | La cotización está marcada «Propuesta confidencial»: precios, hitos de pago y condiciones comerciales |
| `node_modules/`, `dist/` | Regenerables |

> **Privado por defecto.** Se puede abrir después; lo que se publica no se puede despublicar del
> todo (queda en cachés, forks y espejos).

### 2.2 Sitio de documentación en Pages

Un flujo de GitHub Actions construye un sitio estático con la documentación y la hoja de contacto,
y lo publica en `https://<usuario>.github.io/eterclack/`.

Contenido del sitio:

- Índice con el estado por fases
- Los ocho documentos de `docs/` renderizados
- La hoja de contacto con las 14 pantallas

**No** incluye la aplicación: eso sería la página rota de §1.

### 2.3 Integración continua

El mismo repositorio corre en cada push:

```
lint → typecheck → unitarias → integración (Postgres efímero) → build
```

Con eso, un cambio que rompa algo se detiene antes de llegar al VPS.

---

## 3. Fase B — Producción en Hostinger

### 3.1 Requisito: VPS, no hosting compartido

El compartido no ejecuta Node persistente, ni Docker, ni PostgreSQL, ni un MTA.

| Recurso | Mínimo | Recomendado |
|---|---|---|
| Plan | KVM 2 | **KVM 4** (4 vCPU / 16 GB / 200 GB) |
| SO | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS |
| IP | IPv4 dedicada | IPv4 dedicada **con PTR** |

El disco es la restricción real: las fotos lo llenan. Ver [01 §4.1](01-arquitectura.md).

### 3.2 Topología de entornos

| Entorno | Dónde | Base de datos | Wompi | Para qué |
|---|---|---|---|---|
| **local** | Docker en el portátil | efímera | sandbox | Desarrollo |
| **staging** | `staging.eterclack.com`, mismo VPS | propia | sandbox | Ensayo previo a cada release |
| **producción** | `eterclack.com` | propia | producción | Real |

Staging comparte máquina pero **no** comparte base de datos ni buckets. Un `TRUNCATE` en staging no
puede tocar producción.

### 3.3 Secuencia de puesta en marcha

Ocho pasos, en este orden. El orden importa: el correo se prepara antes de tocar el MX, y el MX se
toca antes de abrir el registro público.

| # | Paso | Verificación de salida |
|---|---|---|
| 1 | Provisión y endurecimiento (UFW, SSH por llave, fail2ban, parches automáticos) | `ssh` solo con llave; puertos cerrados salvo 22/80/443/correo |
| 2 | Docker, Caddy y TLS | `https://staging.eterclack.com` con certificado válido |
| 3 | Despliegue de staging + migraciones + semilla | Recorridos E2E en verde contra staging |
| 4 | Backups y restauración **probada** | Restaurar en limpio y que la app levante con esos datos |
| 5 | Monitoreo y alertas | Uptime Kuma avisa al tumbar un contenedor a propósito |
| 6 | **Verificar el puerto 25 saliente** | `telnet gmail-smtp-in.l.google.com 25` conecta |
| 7 | DNS, PTR, SPF/DKIM/DMARC, cutover de MX | 10/10 en mail-tester; correo llega a Gmail y Outlook |
| 8 | Producción + Wompi real + piloto | Una reserva y un pago reales, de punta a punta |

> El paso 6 es un punto de no retorno. Si el puerto 25 saliente está cerrado, el servidor de correo
> propio no es viable y hay que pasar a `MAIL_TRANSPORT=relay`. Comprobarlo **antes** de
> comprometer fechas, no después.

### 3.4 Despliegue continuo

```
push a main
  → CI: lint · typecheck · pruebas · build
  → imágenes a GHCR
  → SSH al VPS
  → BACKUP de la base de datos          ← nunca se omite
  → docker compose pull && up -d
  → prisma migrate deploy
  → healthcheck
  → si falla → rollback a la imagen anterior
```

**Reglas de migración.** Toda migración es compatible hacia atrás, en tres despliegues:

1. Agregar la columna nueva (nullable o con valor por defecto).
2. Desplegar el código que la escribe y la lee.
3. Migrar los datos, y solo entonces eliminar la vieja.

Nunca un `DROP` en el mismo despliegue que introduce el reemplazo: si hay que revertir, la versión
anterior encuentra la base sin la columna que necesita.

### 3.5 Backups

| Qué | Cómo | Frecuencia | Retención |
|---|---|---|---|
| PostgreSQL | `pg_dump` → `restic` → Backblaze B2 | Diario 03:00 | 30 diarios, 12 mensuales |
| Fotos (MinIO) | `rclone sync` → B2 | Diario 04:00 | Versionado 30 días |
| Config y claves DKIM | `restic` → B2 | Semanal | 12 semanas |
| VPS completo | Snapshot de Hostinger | Semanal | Según plan |

> **Un backup no probado no es un backup.** La restauración se ensaya al desplegar y luego cada
> trimestre. Si nunca se restauró, lo que hay es un archivo, no un respaldo.

---

## 4. Lista de verificación antes de abrir

### Configuración
- [ ] `.env` de producción completo, permisos 600, sin valores de ejemplo
- [ ] Llaves Wompi de **producción**; la guarda de arranque rechaza mezclar ambientes
- [ ] URL de eventos de producción **distinta** de la de sandbox
- [ ] Pagos a Terceros activo (trámite del representante legal)
- [ ] `PAYOUTS_REQUIRE_ADMIN_APPROVAL=true`
- [ ] Comisión, ventana de retención y mínimo cargados
- [ ] Textos legales definitivos publicados

### Seguridad
- [ ] UFW, fail2ban y CrowdSec activos
- [ ] SSH sin contraseña ni acceso root
- [ ] Consola de MinIO **no** expuesta
- [ ] Postgres y Redis sin puertos publicados hacia afuera
- [ ] Cabeceras verificadas en securityheaders.com
- [ ] `npm audit` sin vulnerabilidades altas
- [ ] Historial de git escaneado con `gitleaks`

### Datos
- [ ] Migraciones aplicadas
- [ ] Datos de prueba **eliminados** de producción
- [ ] Backup ejecutado y **restauración verificada**
- [ ] Fotógrafos reales cargados con KYC bancario

### Correo
- [ ] PTR aplicado y confirmado
- [ ] SPF, DKIM y DMARC publicados; DMARC en `p=none`
- [ ] Calentamiento de IP en curso
- [ ] Rebotes leyéndose
- [ ] Las plantillas revisadas en Gmail, Outlook y móvil

### Producto
- [ ] E2E en verde contra producción
- [ ] PWA instalable desde el dominio real
- [ ] 0 desbordes en las 5 anchuras
- [ ] Pantalla 404 y de error probadas

---

## 5. Reversa

Cada modo de fallo tiene una salida definida **antes** de necesitarla.

| Falla | Acción | Tiempo |
|---|---|---|
| Despliegue roto | Rollback automático a la imagen anterior | < 2 min |
| Migración destructiva | Restaurar el backup previo a la migración | ~15 min |
| Correo cayendo en spam | `MAIL_TRANSPORT=relay` + credenciales externas | < 2 min |
| Dispersión con error | `PAYOUTS_ENABLED=false`; liquidación manual | Inmediato |
| Wompi caído | Los pagos quedan pendientes; la conciliación los recupera | Automático |
| Disco lleno | Apuntar `S3_ENDPOINT` a Backblaze B2 y migrar con `rclone` | ~1 h |
| VPS comprometido | Restaurar snapshot, **rotar todos los secretos**, revisar auditoría | ~2 h |

Los interruptores (`MAIL_TRANSPORT`, `PAYOUTS_ENABLED`) existen justamente para esto: son variables
de entorno, no cambios de código. Se activan sin desplegar.

---

## 6. Operación posterior

Trabajo recurrente que **no** existía en el plan sobre Cloudflare y ahora es responsabilidad propia:

| Frecuencia | Tarea |
|---|---|
| Diaria | Alertas, cola de correo, pagos pendientes |
| Semanal | Reportes DMARC, listas negras, consumo de disco, conciliación |
| Quincenal | Ejecutar y verificar la corrida de dispersión |
| Mensual | Parches del sistema y actualización de imágenes |
| Trimestral | **Prueba de restauración**, rotación de claves DKIM y secretos |

> Los planes de mantenimiento de la cotización (COP $350.000 y $650.000/mes) se dimensionaron para
> infraestructura administrada. Con VPS propio y servidor de correo, este trabajo sube — **hay que
> revisarlos antes de firmar el soporte**.

---

## 7. Orden recomendado

1. **Hoy:** repositorio privado en GitHub + sitio de documentación en Pages. Sin costo, URL para compartir.
2. **Antes de la Fase 5:** CI con pruebas automatizadas. Cuanto más código haya, más caro es agregarla.
3. **Cuando Wompi confirme la activación:** contratar el VPS y montar staging.
4. **Con staging estable y el correo verificado:** producción y piloto.

Contratar el VPS antes de tener algo que desplegar solo agrega una factura mensual y una máquina
que hay que parchear.
