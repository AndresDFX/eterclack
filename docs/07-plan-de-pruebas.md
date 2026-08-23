# 07 — Plan de pruebas

**Alcance:** todo lo construido (identidad, descubrimiento, calendario, reserva, contrato, PWA) y
lo que falta (galerías, Wompi, correo propio).
**Principio:** cada prueba existe porque hay una forma concreta de fallar. Una prueba que no puede
fallar no aporta nada y sí cuesta mantenerla.

---

## 1. Qué se prueba y con qué

| Nivel | Herramienta | Qué cubre | Cuándo corre |
|---|---|---|---|
| **Unitarias** | Vitest | Reglas puras: dinero, comisiones, firmas, máquinas de estado | Cada commit |
| **Integración** | Vitest + Supertest + Testcontainers | Endpoints contra PostgreSQL y Redis **reales** y efímeros | Cada commit |
| **E2E** | Playwright | Recorridos completos por rol en navegador real | Cada PR |
| **Responsive y accesibilidad** | Playwright + axe-core | Desbordes, objetivos táctiles, contraste, foco | Cada PR |
| **Carga** | k6 | Concurrencia en reserva y búsqueda | Antes de cada release |
| **Seguridad** | Suite propia + `npm audit` | Autorización, idempotencia, límites | Cada PR |
| **Manual** | Guion escrito | Entregabilidad de correo, dinero real, dispositivos físicos | Antes de producción |

> **Regla de mocks:** se simula lo que está fuera de nuestro control (Wompi, el mundo exterior).
> **Nunca** se simula PostgreSQL. Un mock de base de datos prueba el mock, no el sistema — y el
> libro contable y las carreras por una franja solo fallan de verdad contra Postgres.

---

## 2. Pruebas unitarias

Sin base de datos, sin red. Milisegundos.

### 2.1 Dinero — `lib/money.ts`

Es la superficie donde un error cuesta plata.

| Caso | Se espera |
|---|---|
| `splitAmount(315_000_00n, 1500)` | comisión + neto = total, exacto |
| Monto que no divide exacto (`333_333n`, 1500 bps) | Sin céntimos perdidos ni inventados |
| `bps = 0` | Comisión cero, el fotógrafo recibe todo |
| `bps = 10_000` | Comisión total, neto cero |
| `bps` fuera de `[0, 10000]` | Lanza excepción |
| `formatCOP` con 0, 1, millones, mil millones | Separadores de miles correctos |
| **Propiedad:** para 10 000 pares aleatorios | `comisión + neto === total` **siempre** |

Esa última es la que importa: una prueba basada en propiedades encuentra el caso de redondeo que
nadie escribiría a mano.

### 2.2 Criptografía — `lib/crypto.ts`

| Caso | Se espera |
|---|---|
| `hashPassword` dos veces con la misma clave | Hashes distintos (sal aleatoria) |
| `verifyPassword` con la clave correcta | `true` |
| `verifyPassword` con clave incorrecta | `false` |
| Hash con formato corrupto | `false`, sin excepción |
| `timingSafeEqualHex` con longitudes distintas | `false`, sin excepción |

### 2.3 Reglas del calendario — `modules/slots`

| Caso | Se espera |
|---|---|
| `conflictingTurns('DIA_COMPLETO')` | Bloquea mañana, tarde y jornada completa |
| `conflictingTurns('MANANA')` | Bloquea jornada completa y mañana; **no** la tarde |

### 2.4 Firmas de Wompi *(al construir la Fase 6)*

| Caso | Se espera |
|---|---|
| Firma de integridad con el ejemplo oficial de la documentación | Coincide byte a byte |
| Checksum de evento leyendo `signature.properties` dinámicamente | Válido |
| Checksum con una propiedad extra que Wompi agregue | Sigue validando (no hay lista fija en código) |
| Checksum alterado en un carácter | Inválido |

---

## 3. Pruebas de integración

PostgreSQL y Redis reales, levantados por Testcontainers y destruidos al terminar. Cada prueba
arranca con la base migrada y sembrada mínima.

### 3.1 Identidad

| # | Caso | Se espera |
|---|---|---|
| 1 | Registro con datos válidos | 201, usuario creado, correo de verificación encolado |
| 2 | Registro con correo repetido | 409, **sin** crear un segundo usuario |
| 3 | Registro con contraseña de 7 caracteres | 400 con el mensaje del campo |
| 4 | Registro como fotógrafo | Crea perfil en `PENDING`, no visible en búsqueda |
| 5 | Login correcto | 200, cookies `httpOnly` presentes |
| 6 | Login con clave incorrecta | 401 con **el mismo** mensaje que un correo inexistente |
| 7 | Login de cuenta suspendida | 403 |
| 8 | Verificar correo con token válido | `emailVerifiedAt` poblado |
| 9 | Reusar el mismo token | 400 |
| 10 | Token vencido | 400 |
| 11 | `forgot-password` con correo inexistente | 200 **idéntico** al caso existente (no filtra registro) |
| 12 | Cambiar contraseña | Revoca **todas** las sesiones abiertas |
| 13 | Refresh rota el token | El refresh anterior queda revocado |
| 14 | Refresh con token revocado | 401 |

### 3.2 Autorización — la tabla que no puede tener huecos

Se recorre **cada** endpoint contra **cada** rol. Es tedioso y es exactamente donde aparecen los
agujeros.

| Endpoint | Anónimo | Cliente | Fotógrafo | Admin |
|---|---|---|---|---|
| `GET /api/photographers` | 200 | 200 | 200 | 200 |
| `GET /api/photographers/:slug` (aprobado) | 200 | 200 | 200 | 200 |
| `GET /api/photographers/:slug` (pendiente) | 404 | 404 | 404 | 404 |
| `GET /api/photographers/me/profile` | 401 | 403 | 200 | 403 |
| `POST /api/photographers/me/slots` | 401 | 403 | 200 | 403 |
| `POST /api/bookings` | 401 | 200 | 403 | 403 |
| `GET /api/orders/:id` (propia) | 401 | 200 | 200 | 200 |
| `GET /api/orders/:id` (**ajena**) | 401 | **403** | **403** | 200 |
| `POST /api/orders/:id/contract/accept` | 401 | 200 (propia) / 403 (ajena) | 403 | 403 |
| `GET /api/admin/*` | 401 | 403 | 403 | 200 |

> El caso «orden ajena» es el que hay que blindar. Un `403` ahí es la diferencia entre una
> plataforma y una filtración de datos de clientes.

### 3.3 Calendario y reserva

| # | Caso | Se espera |
|---|---|---|
| 1 | Publicar franjas en fechas futuras | 201, aparecen como disponibles |
| 2 | Publicar en fecha pasada | 400 |
| 3 | Publicar la misma franja dos veces | Sin duplicados (`skipDuplicates`) |
| 4 | Retirar franja libre | Se elimina |
| 5 | Retirar franja con cita | 409, **no** se elimina |
| 6 | Reservar franja disponible | 201, orden en `BORRADOR`, franja `RETENIDA` |
| 7 | Reservar franja ya tomada | 409 |
| 8 | **Dos reservas simultáneas sobre la misma franja** | Exactamente **una** gana; la otra recibe 409 |
| 9 | Reservar jornada completa | Elimina mañana y tarde libres de ese día |
| 10 | Reservar mañana | La tarde sigue disponible |
| 11 | Producto de otro fotógrafo | 400 |
| 12 | Reservar sin correo verificado | 403 |
| 13 | Retención vencida | La franja vuelve a `DISPONIBLE` |
| 14 | Comisión congelada | Cambiar la global no altera órdenes existentes |

El caso 8 se prueba con `Promise.all` de dos peticiones reales contra el mismo `slotId`. Es la
única forma de verificar que el `updateMany … where status = DISPONIBLE` cierra la carrera.

### 3.4 Contrato

| # | Caso | Se espera |
|---|---|---|
| 1 | Ver contrato antes de aceptar | Texto con todas las variables resueltas |
| 2 | Aceptar con nombre y casilla | 201, evidencia con IP, navegador, versión, fecha |
| 3 | Aceptar dos veces | 409 |
| 4 | Aceptar contrato ajeno | 403 |
| 5 | Fotógrafo intenta aceptar | 403 |
| 6 | Ver contrato ya aceptado | Devuelve la **copia congelada**, no una nueva renderización |
| 7 | Cambiar la plantilla y volver a consultar | La orden aceptada conserva su texto original |

### 3.5 Correo

| # | Caso | Se espera |
|---|---|---|
| 1 | Cada plantilla renderiza | HTML y texto plano, sin `{{variables}}` sueltas |
| 2 | Destinatario en lista de supresión | Se registra como `SUPPRESSED`, no se envía |
| 3 | Fallo del transporte | Correo en `FAILED`; **la operación de negocio no se cae** |
| 4 | Estrangulamiento a 4/min | 10 correos tardan ≥ 2 min |

### 3.6 Invariantes del sistema

Se ejecutan al final de cada suite de integración, sobre el estado resultante:

1. `SUM(ledger_entries.amount_cents)` de una orden liquidada es **0**.
2. `order.amountCents = commissionCents + photographerCents`, en **todas** las órdenes.
3. Ninguna franja `RESERVADA` sin orden asociada.
4. Ninguna orden sin franja.
5. Ninguna transición de estado sin fila en `audit_log`.
6. Ningún `ContractAcceptance` con `updatedAt > createdAt` (es inmutable).

---

## 4. Pruebas E2E

Playwright, navegador real, tres roles. Los correos se leen de la **API de Mailpit**, no de la
bandeja visual: así el enlace de verificación se extrae y se usa sin intervención.

### 4.1 Recorrido feliz del cliente

```
registro → leer correo en Mailpit → verificar → buscar con filtros →
abrir ficha → elegir producto MEDIO → elegir día y franja → reservar →
aceptar contrato → ver la orden en PAGO_PENDIENTE
```

Verifica en el camino: la franja desaparece del calendario público, llegan los dos correos, la
evidencia del contrato queda visible.

### 4.2 Recorrido del fotógrafo

```
postulación → (admin aprueba) → completar perfil → publicar 5 franjas →
recibir la reserva → ver la cita con su neto → retirar una franja libre
```

### 4.3 Recorrido de administración

```
ver pendientes → aprobar uno → verificar que aparece en búsqueda →
rechazar otro con motivo → verificar el correo → suspender un aprobado
```

### 4.4 Recorridos que **deben** fallar

| Caso | Se espera |
|---|---|
| Cliente A abre la orden de cliente B por URL directa | 403 y pantalla de error, no datos |
| Fotógrafo abre `/admin` | Redirección, sin destello del contenido |
| Reservar sin verificar el correo | Pantalla que exige verificación |
| Dos pestañas reservando la misma franja | Una confirma, la otra muestra «Alguien acaba de tomar esa fecha» |
| Volver atrás tras aceptar el contrato y reenviar | No duplica la aceptación |

---

## 5. Responsive y accesibilidad

Automatizado en cada PR, sobre las 13 rutas × 5 anchos (360, 390, 768, 1024, 1440).

| Comprobación | Umbral | Estado actual |
|---|---|---|
| Desborde horizontal | 0 px en toda combinación | ✅ **0 / 65** |
| Objetivos táctiles (puntero grueso) | ≥ 44 px | ✅ **0 incumplimientos** |
| Objetivos con ratón | ≥ 24 px (WCAG 2.5.8) | ✅ **0 incumplimientos** |
| Contraste de texto | ≥ 4.5:1 normal, 3:1 grande | Pendiente de automatizar con axe |
| Foco visible | Todo elemento accionable | Implementado con `:focus-visible` |
| Navegación por teclado | Recorrido completo sin ratón | Pendiente de guion |
| `prefers-reduced-motion` | Sin animación | Implementado |

> Los enlaces embebidos en una frase quedan exentos del mínimo táctil: WCAG 2.5.8 los excluye
> expresamente, y agrandarlos deformaría la prosa sin que nadie los toque mejor. Una casilla dentro
> de un `<label>` se mide por el label, que es el objetivo real.

**Dispositivos físicos** (manual, antes de producción): iPhone SE (el más estrecho vigente),
iPhone 15, un Android de gama media, iPad. Safari es el que rompe: probarlo de verdad, no emulado.

---

## 6. PWA

| Comprobación | Cómo |
|---|---|
| Manifest válido y completo | Lighthouse |
| Íconos en todos los tamaños, incluido *maskable* | Lighthouse |
| Instalable | Botón de instalación en Chrome; añadir a pantalla de inicio en iOS |
| Funciona sin conexión | Modo avión: la App Shell carga, no una pantalla de error del navegador |
| **La API nunca se cachea** | Reservar sin conexión debe **fallar**, no fingir que funcionó |
| Actualización | Publicar una versión nueva; el service worker antiguo cede el control |

> La quinta es la que importa. Un service worker que cachea `/api` haría que una reserva parezca
> confirmada estando el usuario sin señal. Ese fallo es peor que un error visible.

---

## 7. Carga

k6 contra el entorno de staging, no contra local.

| Escenario | Perfil | Criterio |
|---|---|---|
| Búsqueda con filtros | 50 usuarios / 2 min | p95 < 500 ms, 0 errores |
| Ficha con portafolio | 30 usuarios / 2 min | p95 < 800 ms |
| **Carrera por una franja** | 20 usuarios simultáneos sobre el **mismo** `slotId` | Exactamente **1** reserva creada, 19 con 409 |
| Subida de galería *(Fase 5)* | 5 fotógrafos × 50 fotos | Sin agotar memoria de la API |
| Cola de correo | 100 correos encolados | Se drenan a 4/min sin perder ninguno |

La tercera es la prueba de carga que de verdad importa en este producto: no mide velocidad, mide
corrección bajo concurrencia.

---

## 8. Seguridad

| Comprobación | Cómo |
|---|---|
| Autorización por recurso | Tabla completa de §3.2 |
| Escalada de privilegios | Un cliente no llega a nada de admin ni de fotógrafo |
| Enumeración de usuarios | Login y recuperación responden igual exista o no la cuenta |
| Fuerza bruta | Límite de tasa: 10 intentos / 15 min por IP |
| Inyección SQL | Prisma parametriza; se verifica con carga adversa en los filtros |
| XSS | React escapa; se revisa cualquier `dangerouslySetInnerHTML` (hoy: ninguno) |
| Cabeceras | securityheaders.com sobre staging |
| Dependencias | `npm audit` sin vulnerabilidades altas |
| Secretos | Escaneo del historial de git: `gitleaks` |
| Contratos inmutables | Intento de `UPDATE` sobre `ContractAcceptance` |

**Pendiente para las fases de dinero:**

- Idempotencia de dispersión: la misma llave dos veces produce **un** pago.
- Webhook con checksum inválido: 401 y **sin** cambio de estado.
- Webhook repetido: 200 y sin efecto doble.
- Manipular el monto en la URL del checkout: rechazado por firma de integridad.

---

## 9. Criterios de entrada y salida

**No se abre un PR si** falla `lint`, `typecheck`, unitarias o integración.

**No se despliega a producción si:**

1. Algún recorrido E2E está en rojo.
2. Hay desborde horizontal en cualquier combinación.
3. Hay una vulnerabilidad alta sin resolver.
4. La restauración de backup no se probó en los últimos 90 días.
5. Queda un defecto bloqueante abierto.

**Cobertura mínima exigida** en el camino del dinero (`money`, `ledger`, `bookings`, `payments`,
`payouts`): **90 %** de líneas. En el resto: 70 %. La cobertura no es la meta —es el piso.

---

## 10. Estado actual

Lo verificado hasta hoy se hizo contra la API real en ejecución, con `curl` y sondas por
DevTools Protocol, no con pruebas automatizadas. **Ese es el hueco principal del proyecto.**

| Área | Verificado a mano | Automatizado |
|---|---|---|
| Identidad y RBAC | ✅ | ⬜ |
| Descubrimiento y filtros | ✅ | ⬜ |
| Aprobación de fotógrafos | ✅ | ⬜ |
| Calendario y reserva | ✅ | ⬜ |
| Contrato y evidencia | ✅ | ⬜ |
| Responsive y táctil | ✅ (65 combinaciones) | ⬜ |
| PWA | ✅ | ⬜ |

**Primer paso al retomar:** convertir las verificaciones manuales de §3.1, §3.2 y §3.3 en pruebas
de integración. Ya sabemos que pasan; el valor está en que **sigan** pasando cuando alguien toque
el código dentro de tres meses.
