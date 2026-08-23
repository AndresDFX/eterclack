# 06 — Despliegue en Hostinger (Fase 2)

Semanas 30–33. Hasta aquí todo ha corrido en local; ahora se lleva a un servidor real.

---

## 1. Requisito: VPS, no hosting compartido

El hosting compartido de Hostinger (LiteSpeed + PHP + MySQL) **no sirve** para este proyecto: no
permite procesos Node persistentes, ni Docker, ni PostgreSQL, ni un MTA propio, ni puertos de correo.

**Se requiere un VPS KVM.** El dominio ya está en Hostinger, así que la zona DNS se administra desde
hPanel sin mover nameservers — que era, precisamente, el trámite riesgoso que exigía el plan original
con Cloudflare.

| Recurso | Mínimo | Recomendado | Notas |
|---|---|---|---|
| Plan | KVM 2 | **KVM 4** | Con correo y monitoreo en la misma máquina, 8 GB queda justo |
| SO | Ubuntu 24.04 LTS | Ubuntu 24.04 LTS | — |
| Disco | 100 GB | 200 GB | La restricción real son las fotos — ver [01 §4.1](01-arquitectura.md) |
| IP | IPv4 dedicada | IPv4 dedicada + PTR | **El PTR es obligatorio para el correo** |
| Backups | — | Snapshots del proveedor | No sustituyen los backups externos |

Verificar planes y precios vigentes en el panel de Hostinger antes de contratar.

---

## 2. S9 · Semana 30 — Infraestructura

### 2.1 Endurecimiento del servidor

```bash
# Usuario sin privilegios + SSH solo por llave
adduser deploy && usermod -aG sudo deploy
ssh-copy-id deploy@<IP>
# /etc/ssh/sshd_config: PermitRootLogin no · PasswordAuthentication no
systemctl restart sshd

# Firewall
ufw default deny incoming && ufw default allow outgoing
ufw allow 22/tcp
ufw allow 80,443/tcp
ufw allow 25,465,587,993/tcp        # correo
ufw enable

# Parches automáticos de seguridad
apt install unattended-upgrades && dpkg-reconfigure -plow unattended-upgrades

# Docker
curl -fsSL https://get.docker.com | sh && usermod -aG docker deploy

# Defensa activa
apt install fail2ban
curl -s https://install.crowdsec.net | sh && apt install crowdsec-firewall-bouncer-iptables
```

**Verificación de correo — hacerlo ahora, no en la semana 31:**

```bash
# Hostinger documenta que NO bloquea el puerto 25. Confirmarlo antes de comprometer fechas.
telnet gmail-smtp-in.l.google.com 25
```

Si esto falla, todo el plan de correo propio se detiene: abrir ticket con soporte de Hostinger de
inmediato. Es el punto de no retorno del subsistema de correo.

### 2.2 Caddyfile

```caddyfile
{
    email admin@eterclack.com
}

(comunes) {
    header {
        Strict-Transport-Security "max-age=31536000; includeSubDomains; preload"
        X-Content-Type-Options    "nosniff"
        X-Frame-Options           "DENY"
        Referrer-Policy           "strict-origin-when-cross-origin"
        -Server
    }
}

eterclack.com, www.eterclack.com {
    import comunes
    root * /srv/web
    encode gzip zstd
    @assets path /assets/*
    header @assets Cache-Control "public, max-age=31536000, immutable"
    try_files {path} /index.html
    file_server
}

api.eterclack.com {
    import comunes
    rate_limit {
        zone api { key {remote_host}  events 120  window 1m }
    }
    reverse_proxy api:3000
}

cdn.eterclack.com {
    import comunes
    reverse_proxy minio:9000
}
```

> Caddy obtiene y renueva los certificados de Let's Encrypt sin intervención. Los certificados se
> comparten con el servidor de correo montando el volumen `caddy_data` en el contenedor de DMS.

### 2.3 CI/CD

```
push a main
  → GitHub Actions: lint, typecheck, test, build
  → construir imágenes y publicar en GHCR
  → SSH al VPS
  → backup previo de la base de datos
  → docker compose pull && docker compose up -d
  → prisma migrate deploy
  → healthcheck; si falla → rollback a la imagen anterior
```

Reglas:

- Los secretos viven en GitHub Secrets y en el `.env` del servidor (permisos 600). Nunca en el
  repositorio.
- **Backup antes de cada migración**, sin excepción.
- Migraciones siempre compatibles hacia atrás: primero agregar columna, desplegar, luego migrar
  datos, luego eliminar la vieja. Nunca `DROP` en el mismo despliegue que introduce el reemplazo.
- Rama `staging` → `staging.eterclack.com` con su propia base de datos y llaves de Wompi sandbox.

### 2.4 Backups

| Qué | Cómo | Frecuencia | Retención |
|---|---|---|---|
| PostgreSQL | `pg_dump` comprimido → `restic` → Backblaze B2 | Diario 3:00 | 30 diarios, 12 mensuales |
| MinIO (fotos) | `rclone sync` → B2 | Diario 4:00 | Versionado 30 días |
| Configuración y claves DKIM | `restic` → B2 | Semanal | 12 semanas |
| VPS completo | Snapshot de Hostinger | Semanal | Según el plan |

> **Un backup no probado no es un backup.** El sprint S9 no se cierra hasta ejecutar una restauración
> completa en un entorno limpio y verificar que la aplicación levanta con esos datos. Repetir
> trimestralmente.

### 2.5 Monitoreo

| Herramienta | Vigila |
|---|---|
| Uptime Kuma | Disponibilidad de web, api, SMTP e IMAP; alerta por correo y Telegram |
| Prometheus + Grafana | CPU, RAM, **disco**, latencia, tasa de error |
| Loki + Promtail | Logs centralizados con búsqueda |
| Alertas propias | Cola de correo atascada, webhooks fallidos, descuadre de conciliación, disco al 70 % |

Umbrales de alerta: disco > 70 %, RAM > 85 %, latencia p95 > 2 s, errores 5xx > 1 %, cola de correo
> 100, pagos pendientes con más de 2 h, cualquier descuadre en la conciliación de dispersión.

---

## 3. S10 · Semana 31 — DNS y correo

Secuencia importante. **Primero se prepara todo, después se toca el MX.**

1. Crear registros A: `@`, `www`, `api`, `cdn`, `mail` → IP del VPS.
2. **Bajar el TTL del MX a 300 s y esperar 24 h.** Esto permite revertir en minutos si algo sale mal.
3. Solicitar el **PTR/rDNS** a soporte de Hostinger (`mail.eterclack.com`) y confirmar que quedó aplicado.
4. Publicar SPF, DKIM y DMARC (`p=none`) — ver [03 §5](03-servidor-correo.md).
5. Levantar DMS con TLS real, verificar firma DKIM en un mensaje recibido.
6. **Cutover del MX** en ventana de bajo tráfico, con los buzones anteriores ya exportados.
7. Restaurar el TTL a 3600 s tras 48 h estables.
8. Ejecutar el calentamiento de IP (14 días) — ver [03 §7.2](03-servidor-correo.md).
9. Alta en Google Postmaster Tools y Microsoft SNDS.
10. Verificar 10/10 en mail-tester.com y ausencia en listas negras.

> El calentamiento tarda dos semanas y se solapa con S11 y S12. Durante ese periodo, el volumen del
> piloto debe mantenerse dentro de los límites de la tabla de calentamiento.

---

## 4. S11 · Semana 32 — Producción y piloto

### 4.1 Lista de verificación antes de abrir

**Configuración**
- [ ] `.env` de producción completo, permisos 600, sin ningún valor de ejemplo
- [ ] Llaves Wompi de **producción**; validación de arranque que rechaza mezclar ambientes
- [ ] URL de eventos de producción registrada en Wompi, **distinta** de la de sandbox
- [ ] Pagos a Terceros confirmado como activo (trámite A2)
- [ ] `PAYOUTS_ENABLED=true` y `PAYOUTS_REQUIRE_ADMIN_APPROVAL=true`
- [ ] Comisión, ventana de retención y mínimo de dispersión cargados
- [ ] Textos legales definitivos publicados

**Seguridad**
- [ ] UFW, fail2ban y CrowdSec activos
- [ ] SSH sin contraseña ni acceso root
- [ ] Consola de MinIO **no expuesta** a internet
- [ ] Postgres y Redis sin puertos publicados hacia afuera
- [ ] Cabeceras de seguridad verificadas en securityheaders.com
- [ ] Revisión de dependencias sin vulnerabilidades altas

**Datos**
- [ ] Migraciones aplicadas
- [ ] Datos de prueba **eliminados** de producción
- [ ] Backup ejecutado y restauración verificada
- [ ] 3 fotógrafos reales cargados con KYC bancario completo

**Correo**
- [ ] Calentamiento en curso, sin bloqueos
- [ ] Rebotes leyéndose correctamente
- [ ] Las 17 plantillas revisadas en Gmail, Outlook y móvil

### 4.2 El piloto

| Día | Actividad |
|---|---|
| 1 | Capacitación a los 3 fotógrafos (2 h); publican perfil, agenda y portafolio |
| 2–3 | Un cliente real recorre el flujo completo: solicitud → contrato → **pago real de monto bajo** |
| 4–5 | Galería, selección, entrega y descarga |
| 6 | **Primera dispersión real**, monto pequeño, verificada manualmente contra el extracto bancario |
| 7 | Revisión de logs, alertas, entregabilidad y consumo; registro de defectos |

> La primera dispersión real se verifica **persona a persona**: el fotógrafo confirma que el dinero
> llegó y por cuánto, y se coteja con el extracto. Ninguna automatización sustituye esta
> confirmación la primera vez.

### 4.3 Plan de reversa

| Falla | Acción |
|---|---|
| Despliegue roto | `docker compose up -d` con la imagen anterior (rollback automatizado en CI) |
| Migración destructiva | Restaurar el backup previo a la migración |
| Correo cayendo en spam | `MAIL_TRANSPORT=relay` + credenciales del proveedor externo → operativo en 2 minutos |
| Dispersión con error | `PAYOUTS_ENABLED=false`; liquidación manual como en la cotización original |
| Wompi caído | Los pagos quedan pendientes; la conciliación los recupera al restablecerse |
| VPS comprometido | Restaurar snapshot, rotar **todos** los secretos, revisar auditoría |

---

## 5. S12 · Semana 33 — Estabilización y entrega

- Corregir los defectos del piloto
- Ajustar límites de tasa y cuotas con datos reales
- Documentación final: manual de operación administrativa, guía de despliegue, variables de entorno,
  procedimiento de restauración
- Sesión de entrega y capacitación (2 h, según la cotización)
- Acta de aceptación → arrancan los **30 días de garantía**

### 5.1 Traspaso de responsabilidades

Al cerrar, EterClack asume la operación diaria. Antes de firmar debe quedar claro **quién** hace esto
y **con qué plan de soporte**:

| Frecuencia | Tarea |
|---|---|
| Diaria | Revisar alertas; cola de correo; pagos pendientes |
| Semanal | Reportes DMARC; listas negras; consumo de disco; conciliación de dispersión |
| Quincenal | Ejecutar y verificar la corrida de dispersión |
| Mensual | Parches del sistema y actualización de imágenes |
| Trimestral | **Prueba de restauración de backup**; rotación de claves DKIM y secretos |

> Esto es trabajo nuevo que no existía en el plan sobre Cloudflare. Los planes de mantenimiento de la
> cotización (COP $350.000 y $650.000/mes) se dimensionaron sin él y **deben revisarse antes de
> firmar el soporte posventa**.

---

## 6. Fuentes

- Hostinger — Puerto SMTP 25 en VPS: https://www.hostinger.com/support/7854530-is-smtp-port-25-blocked-on-hostinger-vps/
- Caddy — documentación: https://caddyserver.com/docs/
- docker-mailserver: https://docker-mailserver.github.io/docker-mailserver/latest/
