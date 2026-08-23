# 00 — Plan de implementación EterClack MVP

**Fecha:** agosto 2026
**Base:** cotización MVP 2026 (`base/cotizacion_eterclack_mvp_2026.pdf`)
**Cambios aplicados:** Cloudflare → Hostinger · correo externo → servidor propio · PayU → Wompi con dispersión automática
**Estrategia:** Fase 1 completa en local · Fase 2 despliegue en Hostinger

---

## 1. Qué cambia frente a la cotización, y por qué importa

La cotización cerró un alcance de **COP $7.000.000 / 24 semanas** sobre tres supuestos que ahora
cambian. No es un cambio cosmético de proveedor: dos de los tres mueven trabajo que estaba
explícitamente **excluido** del precio.

### 1.1 Cloudflare → Hostinger

Neutro-negativo en esfuerzo. Se pierde infraestructura administrada (escalado, CDN, WAF, TLS,
backups del proveedor) y se gana control total con un costo mensual predecible. El trabajo que
Cloudflare hacía sin intervención —provisión, endurecimiento, TLS, backups, monitoreo, parches—
pasa a ser nuestro, en Fase 2.

Detalle técnico en [01 — Arquitectura](01-arquitectura.md).

### 1.2 Correo externo → servidor de correo propio

**Alcance nuevo.** La cotización decía «Correo: proveedor transaccional externo» — es decir, una
línea de configuración. Un servidor propio es un subsistema completo: MTA, IMAP, antispam, firmas
DKIM, gestión de rebotes, lista de supresión, reputación de IP y monitoreo de entregabilidad.

> **El riesgo real no es montarlo, es que los correos lleguen a la bandeja de entrada.** Gmail y
> Outlook desconfían por defecto de una IP nueva. Se mitiga con SPF/DKIM/DMARC correctos, PTR,
> calentamiento gradual y monitoreo —todo eso está en el plan—, pero es una responsabilidad
> operativa permanente, no una tarea que se cierra y se olvida.

Además, **Hostinger limita el envío saliente a 5 correos por minuto en VPS**. La arquitectura debe
encolar y estrangular envíos desde el día uno. Detalle en [03 — Servidor de correo](03-servidor-correo.md).

### 1.3 PayU → Wompi con dispersión automática

**Alcance nuevo y el cambio de mayor impacto.** La cotización era explícita:

> «"Pagos a fotógrafos" significa saldo y control interno, no dispersión automática.»
>
> «Split/dispersión automática: requiere producto PayU compatible, aprobación comercial/legal y **nueva cotización**.»

Wompi sí tiene el producto que PayU nunca confirmó: **Pagos a Terceros (Payouts)**, con ambiente de
pruebas, lotes, idempotencia y destino a cuentas bancarias, Nequi, Daviplata o llaves Bre-B. Eso
desbloquea técnicamente la dispersión, pero trae consigo el trabajo que la cotización había evitado:
libro contable, KYC bancario de fotógrafos, ventanas de retención, corridas de pago, reintentos,
conciliación y trazabilidad de dinero de terceros.

Detalle en [04 — Wompi](04-wompi.md).

> ⚠️ **Lo jurídico y tributario no lo resuelve el proveedor.** Retener y dispersar dinero de terceros
> sigue exigiendo revisión de retenciones (retefuente / reteICA), facturación, RUT de los fotógrafos
> y política de reembolsos. Cambiar PayU por Wompi elimina el bloqueo técnico, no la obligación
> legal. Esto debe validarlo el contador y el abogado del cliente **antes** de la primera dispersión
> con dinero real.

---

## 2. Impacto en cronograma

| Bloque | Cotización | Plan vigente | Δ |
|---|---:|---:|---:|
| Alcance funcional original (descubrimiento → entrega) | 24 sem | 24 sem | — |
| Servidor de correo propio | 0 | 3 sem | +3 |
| Dispersión automática Wompi (libro, KYC, corridas, conciliación) | 0 | 4 sem | +4 |
| Infra autogestionada (provisión, CI/CD, backups, monitoreo) | 0 | 2 sem | +2 |
| Ahorro por no depurar el modelo de ejecución de Workers/D1 | — | −1 sem | −1 |
| **Total** | **24 sem** | **32 sem** | **+8** |

### Opción de compresión a ~26 semanas

Si la fecha manda sobre el alcance, así se recupera tiempo — y hay que decidirlo **antes del hito
H1**, no después:

| Recorte | Ahorro | Qué se pierde |
|---|---:|---|
| Arrancar con relay SMTP externo y construir el servidor propio después del piloto | −2 sem | El correo propio se aplaza; el módulo ya queda abstraído para el cambio posterior |
| Dispersión semiautomática: el admin aprueba y dispara el lote, sin corrida programada ni reintentos automáticos | −2,5 sem | Menos automatización; el libro contable y la integración con la API sí quedan |
| Descargas ZIP masivas → solo descarga individual firmada | −0,5 sem | Fricción para el cliente en entregas grandes |
| Observabilidad completa (Grafana/Loki) → Netdata + Uptime Kuma | −1 sem | Menos capacidad de diagnóstico en producción |

**Recomendación:** no comprimir el bloque de pagos. Es donde un error cuesta dinero real y
confianza. Si algo se aplaza, que sea el correo propio con un relay externo de por medio — es
reversible sin tocar el modelo de datos.

---

## 3. Fases

### Fase 1 — Desarrollo y pruebas 100 % en local (semanas 1–29)

Todo corre en `docker compose` en la máquina de desarrollo: PostgreSQL, Redis, MinIO, Mailpit, el
stack de correo real y la API. Wompi se integra contra **sandbox** usando un túnel público para
recibir webhooks. No se compra VPS todavía.

### Fase 2 — Despliegue en Hostinger (semanas 30–33)

Provisión del VPS, DNS en hPanel, migración de MX, calentamiento de IP, Wompi en producción, piloto
con fotógrafos reales y estabilización.

---

## 4. Cronograma detallado

### 4.1 Vía administrativa (arranca semana 1, en paralelo)

Estos trámites tienen tiempos que no controlamos. No bloquean el código, pero **sí bloquean la Fase
2**. Si arrancan tarde, retrasan la salida a producción completa.

| # | Trámite | Cuándo | Responsable | Depende de |
|---|---|---|---|---|
| A1 | Crear comercio Wompi y obtener llaves de **sandbox** | Semana 1 | Cliente | — |
| A2 | Solicitar activación de **Pagos a Terceros** (requiere representante legal y verificación biométrica) | Semana 1 | Cliente | A1 |
| A3 | Definir comisión de plataforma, política de cancelación y ventana de retención | Semana 2 | Cliente | — |
| A4 | Revisión tributaria: retenciones, facturación, RUT de fotógrafos | Semanas 2–6 | Contador del cliente | A3 |
| A5 | Textos legales: contrato, tratamiento de datos, derechos de imagen, menores | Semanas 2–8 | Abogado del cliente | — |
| A6 | Identidad visual final, categorías y zonas | Semana 3 | Cliente | — |
| A7 | Contratar VPS Hostinger y solicitar **PTR/rDNS** a soporte | Semana 28 | Cliente | — |
| A8 | Llaves Wompi de **producción** y activación confirmada de Payouts | Semana 30 | Cliente | A2, A4 |
| A9 | Reclutar 3 fotógrafos con casos reales para el piloto | Semana 30 | Cliente | — |

### 4.2 Sprints de desarrollo

| Sprint | Semanas | Foco | Entregable verificable |
|---|---|---|---|
| **S0 — Fundaciones** | 1–2 | Monorepo, Docker Compose, CI, esqueleto de autenticación, módulo de correo abstracto con Mailpit | `docker compose up` levanta todo, healthcheck verde, un correo de prueba llega a Mailpit |
| **S1 — Diseño y modelo** | 3–5 | Flujos, wireframes, sistema visual, esquema Prisma completo, migraciones, seeds | Base migrada con datos semilla de los tres roles; wireframes aprobados (**H1**) |
| **S2 — Identidad y perfiles** | 6–9 | Registro, verificación por correo, sesiones, RBAC por rol y por recurso, postulación de fotógrafo, aprobación admin, portafolio, búsqueda y filtros | Un fotógrafo se postula, el admin lo aprueba y aparece en búsqueda; uno no aprobado no aparece (**H2**) |
| **S3 — Solicitud, agenda y contrato** | 10–13 | Disponibilidad, solicitud, propuesta y ajuste, orden, contrato versionado, aceptación con evidencia (nombre, fecha/hora, IP, versión) | Cliente solicita → fotógrafo propone → cliente acepta → orden creada con contrato congelado y descargable |
| **S4 — Servidor de correo** | 14–16 | `docker-mailserver` local, DKIM, Rspamd, buzones, cola con estrangulamiento, plantillas, rebotes, lista de supresión | Correo firmado con DKIM verificable localmente; un rebote simulado agrega la dirección a supresión |
| **S5 — Wompi: recaudo** | 17–19 | Checkout Web, firma de integridad, webhook con validación de checksum e idempotencia, estados de pago, panel financiero | Sandbox procesa aprobado, rechazado y pendiente; la orden se confirma solo por webhook, nunca por la URL de retorno (**H3**) |
| **S6 — Galerías y entrega** | 20–23 | MinIO con subida directa firmada, miniaturas en worker, permisos por recurso, selección con límite de paquete, comentarios, entrega, descargas firmadas | El cliente selecciona y descarga; un enlace vencido o ajeno devuelve 403 (**H4**) |
| **S7 — Wompi: dispersión** | 24–27 | Libro contable, comisión, ventana de retención, KYC bancario, corridas de pago, lotes, idempotencia, reintentos, conciliación, panel admin | Un pago aprobado genera saldo; la corrida dispersa vía sandbox; el fallo de un ítem no tumba el lote y se reintenta |
| **S8 — QA y endurecimiento** | 28–29 | E2E de los tres roles, revisión de seguridad, límites de tasa, carga controlada, documentación, manual de operación | Suite E2E verde, checklist de seguridad cerrado, manual entregado |
| **S9 — Infra Hostinger** | 30 | Provisión, endurecimiento, Docker, Caddy con TLS, CI/CD, backups, monitoreo | Staging desplegado por HTTPS; **restauración de backup probada**, no solo configurada |
| **S10 — DNS y correo en producción** | 31 | Registros en hPanel, PTR, cutover de MX, SPF/DKIM/DMARC, calentamiento de IP | 10/10 en mail-tester, DMARC recibiendo reportes, correos llegando a Gmail y Outlook |
| **S11 — Producción y piloto** | 32 | Wompi producción, datos reales de 3 fotógrafos, piloto acompañado | Piloto de punta a punta con dinero real y **una dispersión efectiva** (**H5**) |
| **S12 — Estabilización** | 33 | Defectos del piloto, ajuste de límites, capacitación (2 h), entrega | Acta de aceptación firmada; arrancan los 30 días de garantía |

### 4.3 Hitos de aprobación

| Hito | Semana | Criterio | Pago asociado |
|---|---|---|---|
| **H1** | 5 | Alcance, reglas, flujos y diseño aprobados | 30 % al kickoff |
| **H2** | 9 | Perfiles, búsqueda y solicitud demostrables | 25 % |
| **H3** | 19 | Reserva, contrato y Wompi sandbox demostrables | 25 % |
| **H4** | 23 | Galerías y selección completas | — |
| **H5** | 32 | Piloto aceptado con dispersión real ejecutada | 20 % |

> El esquema de pagos por hitos de la cotización se mantiene; solo se corren las semanas de H3 y H5.
> **El alcance adicional (correo propio + dispersión) no está cubierto por los COP $7.000.000.**
> Debe cotizarse aparte o intercambiarse por alcance equivalente, según la cláusula 14 de gestión de
> cambios de la propuesta.

---

## 5. Alcance funcional

Se conserva íntegro el alcance de las secciones 3 y 4 de la cotización. Resumen:

**Cliente** — cuenta y acceso · descubrimiento con filtros por especialidad, zona y presupuesto ·
solicitud y agenda · cotización y reserva · contrato con evidencia de aceptación · pago · proyecto y
galería privada con selección y comentarios · entrega y descarga · historial.

**Fotógrafo** — postulación y perfil · agenda y bloqueo de fechas · leads y tablero por estado ·
galerías con carga directa · revisión de selección · **pagos y saldos, ahora con dispersión
automática** (antes solo saldo interno) · notificaciones.

**Administración** — dashboard · aprobación y suspensión de usuarios · gestión de especialidades,
zonas, servicios y comisión · consulta de órdenes y eventos Wompi · **libro de saldos y corridas de
dispersión** (antes liquidación manual) · control de galerías · auditoría · configuración de correos.

**Exclusiones** — se mantienen todas las de la sección 12 de la cotización, **salvo**
«split / dispersión automática», que pasa a estar incluida.

---

## 6. Riesgos

| Riesgo | Impacto | Probabilidad | Mitigación |
|---|---|---|---|
| Los correos del servidor propio caen en spam | Alto — todo el flujo depende del correo | **Alta** | SPF/DKIM/DMARC, PTR, calentamiento gradual, monitoreo DMARC, y relay externo como interruptor de emergencia (una variable de entorno) |
| El límite de 5 correos/min de Hostinger satura la cola en picos | Medio | Media | Cola con estrangulamiento y prioridades: transaccional crítico primero, avisos después |
| La activación de Pagos a Terceros se demora | Alto — bloquea Fase 2 | Media | Iniciar en semana 1; el desarrollo avanza contra sandbox |
| Una dispersión paga de más, de menos o dos veces | **Crítico** | Baja | Idempotencia obligatoria, libro contable con doble partida, montos en centavos enteros, aprobación admin en el MVP, conciliación diaria |
| Un solo VPS: punto único de falla, sin escudo DDoS | Alto | Media | Snapshots, backups externos con restauración probada, límites de tasa en Caddy, CrowdSec, plan de restauración documentado |
| Las fotos llenan el disco del VPS | Medio | **Alta** | Cuotas por fotógrafo y proyecto, miniaturas, retención de 90 días, alerta al 70 % — y la salida: MinIO habla S3, se apunta a Backblaze B2 sin tocar código |
| La revisión tributaria llega tarde y bloquea la dispersión real | Alto | Media | A4 arranca en semana 2; el piloto puede correr con dispersión en sandbox si no está lista |
| Dependencia de una sola persona desarrollando | Alto | Media | Repositorio del cliente, documentación viva en `docs/`, infraestructura declarada en código |

---

## 7. Definición de terminado

Una historia está terminada cuando:

1. Cumple su criterio de aceptación funcional.
2. Tiene pruebas automatizadas: unitarias para reglas de negocio, integración para endpoints, E2E para flujos de rol.
3. La autorización se verifica **en el servidor y por recurso** — no basta con ocultar el botón.
4. El dinero se maneja como enteros en centavos, nunca en punto flotante.
5. Los eventos críticos (cambio de estado, contrato, pago, publicación, dispersión) quedan en auditoría.
6. Las variables nuevas están en `.env.example` y documentadas.
7. `npm run typecheck && npm test` pasa en CI.

---

## 8. Criterios de aceptación final

Los diez de la cotización, con tres ajustes por el nuevo alcance (marcados en negrita):

1. Los tres roles solo acceden a funciones y datos autorizados.
2. Un fotógrafo aprobado publica perfil, disponibilidad y portafolio.
3. Un cliente filtra, solicita, acepta condiciones y crea una orden.
4. **Wompi sandbox procesa los escenarios principales; el webhook idempotente actualiza la orden sin depender del navegador.**
5. El contrato aceptado conserva versión, identidad y fecha/hora, y se puede descargar.
6. El fotógrafo sube una galería privada, el cliente selecciona y el fotógrafo publica la entrega final.
7. Los enlaces vencidos o ajenos no permiten descargar fotos.
8. **Administración ve órdenes y pagos, configura la comisión y ejecuta una corrida de dispersión que llega a la cuenta del fotógrafo con trazabilidad completa.**
9. **Los correos transaccionales llegan a bandeja de entrada en Gmail y Outlook, firmados con DKIM y con SPF y DMARC alineados.**
10. Funciona en versiones actuales de Chrome, Safari, Firefox y Edge, con experiencia responsiva.
11. Documentación entregada y piloto completado sin defectos bloqueantes abiertos.
