# 04 — Wompi: recaudo y dispersión

Reemplaza por completo la sección 5 de la cotización (PayU Colombia).

Son **dos integraciones distintas**, con productos, credenciales y ciclos de activación separados.
Confundirlas es el error más común al empezar.

| | **Recaudo** | **Dispersión** |
|---|---|---|
| Producto | Pagos en línea (Checkout Web) | **Pagos a Terceros** (Payouts) |
| Dirección del dinero | Cliente → EterClack | EterClack → Fotógrafo |
| Credenciales | `pub_*`, `prv_*`, secretos de integridad y eventos | `x-api-key` + `user-principal-id` |
| Activación | Registro del comercio | **Trámite aparte**: representante legal + biometría |
| Sprint | S5 (semanas 17–19) | S7 (semanas 24–27) |

---

# Parte A — Recaudo

## A.1 Modalidad elegida: Checkout Web

Se mantiene el criterio de la cotización (que elegía WebCheckout de PayU): **redirección a un
checkout alojado**. El usuario sale a Wompi, paga y vuelve.

- Exposición PCI mínima — EterClack nunca ve ni almacena números de tarjeta.
- Menos superficie de ataque y menos código propio en el camino del dinero.
- El Widget embebido y la API directa quedan como evolución posterior, no como MVP.

Métodos disponibles vía checkout: tarjetas, PSE, Nequi, Bancolombia Transfer y Botón Bancolombia,
Daviplata y efectivo, según lo habilitado en el comercio.

## A.2 Ambientes y llaves

| | Sandbox | Producción |
|---|---|---|
| Base URL | `https://sandbox.wompi.co/v1` | `https://production.wompi.co/v1` |
| Llave pública | `pub_test_…` | `pub_prod_…` |
| Llave privada | `prv_test_…` | `prv_prod_…` |
| Secreto de integridad | `test_integrity_…` | `prod_integrity_…` |
| Secreto de eventos | `test_events_…` | `prod_events_…` |

Reglas no negociables:

1. Las llaves de un ambiente **solo** funcionan con la URL de ese ambiente.
2. La llave privada y ambos secretos **nunca** salen del backend. Jamás en el bundle del frontend,
   jamás en un repositorio.
3. URLs de eventos **separadas** para sandbox y producción.
4. Todo esto se valida al arrancar: si `WOMPI_BASE_URL` contiene `production` y la llave empieza por
   `pub_test_`, la API **no levanta**. Un error de configuración así, descubierto en caliente,
   cuesta transacciones reales.

## A.3 Firma de integridad

Impide que alguien manipule el monto en el navegador antes de pagar.

```
SHA256( <referencia> + <montoEnCentavos> + <moneda> + <secretoDeIntegridad> )
```

Con fecha de expiración:

```
SHA256( <referencia> + <montoEnCentavos> + <moneda> + <fechaExpiracion> + <secretoDeIntegridad> )
```

```ts
// apps/api/src/modules/payments/wompi.signature.ts
import { createHash } from 'node:crypto';

export function integritySignature(
  reference: string,
  amountInCents: bigint,
  currency: 'COP',
  secret: string,
  expiresAt?: string,
): string {
  const parts = expiresAt
    ? [reference, amountInCents.toString(), currency, expiresAt, secret]
    : [reference, amountInCents.toString(), currency, secret];
  return createHash('sha256').update(parts.join('')).digest('hex');
}
```

> **Solo en el servidor.** Calcularla en el frontend expone el secreto de integridad y anula la
> protección por completo.

## A.4 Flujo de pago

```
Cliente acepta contrato
      │
      ▼
POST /api/orders/:id/checkout            (API)
      │  · verifica: orden es del cliente, estado = contrato_aceptado
      │  · genera referencia única e irrepetible → ETC-{orderId}-{intento}-{nanoid}
      │  · monto tomado de la ORDEN en base de datos, nunca del request
      │  · calcula la firma de integridad
      │  · crea registro `payment` en estado `iniciado`
      ▼
Redirección a https://checkout.wompi.co/p/?public-key=…&currency=COP
              &amount-in-cents=…&reference=…&signature:integrity=…
              &redirect-url=…&customer-email=…
      │
      ▼
El cliente paga en Wompi
      │
      ├──── redirect-url ──→ /pago/resultado?id=<transactionId>
      │        └─ SOLO INFORMATIVO. Muestra "estamos confirmando tu pago".
      │           Consulta GET /transactions/{id} para pintar algo, pero
      │           NO cambia el estado de la orden. Nunca.
      │
      └──── webhook ───────→ POST /api/webhooks/wompi
               · valida X-Event-Checksum
               · idempotencia por (transaction.id, status)
               · guarda el evento crudo en `wompi_events`
               · ESTA es la única fuente de verdad
               · APPROVED → orden = reservada, bloquear fecha,
                            asiento en el libro contable, notificar
```

**La regla que la cotización ya establecía y que aquí se conserva:** el navegador nunca decide que
un pago fue aprobado. Un usuario puede cerrar la pestaña, perder señal o manipular la URL de
retorno. Solo el evento servidor-a-servidor confirma.

## A.5 Webhook: validación del checksum

Wompi envía el checksum en el encabezado `X-Event-Checksum` y en el cuerpo. Se construye
concatenando **los valores de las propiedades que el propio evento lista** en `signature.properties`,
seguidos del `timestamp` y del secreto de eventos.

```ts
function validateEventChecksum(body: WompiEvent, secret: string): boolean {
  const concatenated = body.signature.properties
    .map((path) => path.split('.').reduce((o, k) => o?.[k], body.data))
    .join('');

  const expected = createHash('sha256')
    .update(concatenated + body.timestamp + secret)
    .digest('hex')
    .toUpperCase();

  return timingSafeEqualHex(expected, body.signature.checksum.toUpperCase());
}
```

Detalles que importan:

- **Leer `signature.properties` dinámicamente.** No fijar los campos en código: Wompi puede
  cambiarlos y una lista rígida rompe la validación en silencio.
- Comparar en **tiempo constante** (`crypto.timingSafeEqual`), no con `===`.
- Responder **200** siempre que el evento sea válido, incluso si es duplicado. Wompi reintenta hasta
  3 veces (a los 30 min, 3 h y 24 h) ante cualquier respuesta distinta.
- Checksum inválido → **401 y ningún cambio de estado**. Registrar el intento como incidente.

## A.6 Idempotencia y estados

`wompi_events` guarda cada evento crudo con índice único sobre `(transaction_id, status, timestamp)`.
Un evento repetido se registra y se ignora sin efecto secundario.

| Estado Wompi | Estado del pago | Efecto en la orden |
|---|---|---|
| `PENDING` | `pendiente` | Sin cambio; la orden espera |
| `APPROVED` | `aprobado` | → `reservada`, bloquea fecha, genera asiento contable, notifica |
| `DECLINED` | `rechazado` | Vuelve a `pago_pendiente`, permite reintentar con **nueva referencia** |
| `VOIDED` | `anulado` | → `cancelada`, libera fecha |
| `ERROR` | `error` | Alerta al admin, permite reintento |

**Transiciones prohibidas:** de `aprobado` no se sale por webhook. Un reembolso o ajuste posterior es
una operación administrativa con su propio asiento contable, nunca una mutación del pago original.

## A.7 Conciliación

Los webhooks se pierden. Una tarea diaria a las 6:00:

1. Busca pagos en `iniciado` o `pendiente` con más de 2 horas.
2. Consulta `GET /transactions?reference=<ref>` en Wompi.
3. Si Wompi dice `APPROVED` y localmente no lo está, aplica el mismo camino que el webhook (misma
   función, para que no existan dos rutas de código que puedan divergir).
4. Discrepancias irresolubles → alerta al admin.

## A.8 Casos de prueba obligatorios (S5)

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Pago aprobado | Orden `reservada`, fecha bloqueada, asiento creado, dos correos enviados |
| 2 | Pago rechazado | Orden vuelve a `pago_pendiente`, reintentable |
| 3 | Pendiente que luego aprueba (PSE) | Estado intermedio correcto, luego confirmación |
| 4 | Webhook duplicado | 200, **cero** efectos secundarios adicionales |
| 5 | Webhook con checksum inválido | 401, sin cambio de estado, incidente registrado |
| 6 | Webhook fuera de orden (aprobado antes que pendiente) | Estado final correcto |
| 7 | Usuario cierra el navegador tras pagar | El webhook confirma igual |
| 8 | Monto manipulado en la URL | Wompi rechaza por firma de integridad |
| 9 | Referencia reutilizada | Rechazada por la API |
| 10 | Wompi caído al iniciar checkout | Error claro, orden intacta, reintentable |

---

# Parte B — Dispersión (Pagos a Terceros)

## B.1 Lo que este cambio desbloquea

La cotización cerró este punto así:

> «"Pagos a fotógrafos" significa saldo y control interno, no dispersión automática. Retener,
> custodiar o dividir dinero de terceros puede exigir un producto específico de PayU, contrato
> comercial y revisión jurídica/tributaria.»

Wompi **sí** tiene ese producto. Eso cambia el alcance del MVP: el fotógrafo deja de esperar una
transferencia manual del administrador y recibe su dinero automáticamente.

## B.2 Capacidades del producto

Según la documentación de Wompi:

- Destinos: cuentas bancarias de cualquier banco del país, billeteras (Nequi, Daviplata) y **llaves
  Bre-B** (celular, cédula o llave personalizada) sin necesitar datos bancarios completos.
- Envío individual o **en lotes**, por JSON o por archivo.
- **Ambiente de pruebas** que permite simular pagos, recargas del saldo de origen y validar reportes.
- **Idempotencia** mediante llave única generada por el cliente, con vencimiento a 24 horas.
- Tipos de pago: `PAYROLL`, `PROVIDERS`, `OTHER`. → EterClack usa **`PROVIDERS`**.

Límites documentados:

| Límite | Valor |
|---|---|
| Tope diario | COP $1.500.000.000 |
| Lotes diarios máximos | 3.800 |
| Longitud de número de cuenta | 6 a 20 caracteres numéricos |

## B.3 Autenticación

Distinta de la de recaudo:

```http
user-principal-id: {ID_Usuario_Principal}
x-api-key: {API_Key}
```

Notas operativas de la documentación:

- Requiere **2FA configurado** para poder ver las llaves en el panel.
- Requiere el producto **activo** para que las llaves aparezcan en la sección de Desarrolladores.
- Tras regenerar una API Key hay que **esperar 2–3 minutos** antes de usarla.

> **Pendiente de confirmar en S7:** las URL base de sandbox y producción de Payouts no están
> publicadas en las páginas de documentación consultadas. Se obtienen de la **colección de Postman**
> o del **SwaggerHub** enlazados desde la documentación de Wompi. Es la primera tarea del sprint —
> `WOMPI_PAYOUTS_BASE_URL` queda vacía en `.env.example` a propósito, para que nadie invente un valor.

## B.4 Endpoints

| Propósito | Método | Ruta |
|---|---|---|
| Pago individual | POST | `/payouts` |
| Lote por archivo | POST | `/payouts/file` |
| Listado de bancos | GET | `/banks` |
| Consultar lotes | GET | `/payouts` |
| Reportes | GET | `/payouts/reports` |

Campos requeridos por pago:

```jsonc
{
  "accountId":     "<cuenta de origen>",
  "legalIdType":   "CC",            // CC | NIT | CE
  "legalId":       "1020304050",
  "bankId":        "1007",          // de GET /banks
  "accountType":   "SAVINGS",       // ahorros | corriente
  "accountNumber": "12345678901",   // 6–20 dígitos
  "name":          "María Gómez",
  "email":         "maria@ejemplo.com",
  "amount":        42500000,        // EN CENTAVOS
  "reference":     "PO-2026-000123",
  "paymentType":   "PROVIDERS"
}
```

Estados de lote: `PENDING` → `PARTIAL_PAYMENT` → `TOTAL_PAYMENT`.

`PARTIAL_PAYMENT` es el estado que hay que tratar con cuidado: **algunos ítems del lote pagaron y
otros no**. El sistema debe reconciliar ítem por ítem, no lote por lote.

## B.5 Activación — arranca en la semana 1

No es un formulario de cinco minutos:

1. Lo realiza el **representante legal**, no un empleado ni el desarrollador.
2. Elegir modalidad: solo cuenta Wompi (usa el saldo de pagos en línea), o cuenta Wompi + cuentas
   Bancolombia.
3. Verificación de identidad: autorizar términos y permisos, activar ubicación, fotografiar el
   documento por ambas caras y grabar un **video biométrico**.
4. Esperar la confirmación de activación por parte de Wompi.

> Por eso A2 está en la semana 1 del plan. Si esto se inicia en la semana 24, el sprint S7 se
> desarrolla a ciegas y la Fase 2 se retrasa.

## B.6 El libro contable

Aquí está el núcleo del alcance nuevo. **No se puede dispersar dinero sin llevar un libro.**

Cada pago aprobado genera asientos que siempre cuadran en cero:

```
Pago aprobado de COP $500.000, comisión 15 %

  Asiento 1  order_payment      +50.000.000 c   (entra a EterClack)
  Asiento 2  platform_fee        −7.500.000 c   (comisión de la plataforma)
  Asiento 3  photographer_payable −42.500.000 c  (deuda con el fotógrafo)
                                 ─────────────
                                          0
```

Estados del saldo del fotógrafo:

| Estado | Significado | Transición |
|---|---|---|
| `retenido` | Pago recibido, servicio aún no entregado | Automática al aprobarse el pago |
| `disponible` | Entrega lista + `PAYOUT_HOLD_DAYS` cumplidos | Tarea diaria |
| `programado` | Incluido en una corrida | Al armar el lote |
| `en_proceso` | Enviado a Wompi, esperando confirmación | Al enviar el lote |
| `pagado` | Confirmado por Wompi | Por evento o consulta |
| `fallido` | Rechazado — datos bancarios malos, cuenta cerrada | Vuelve a `disponible` tras corregir |
| `ajustado` | Corrección manual del admin, con motivo obligatorio | Solo admin, siempre auditado |

**Ventana de retención.** El saldo pasa a `disponible` solo después de que el fotógrafo marca
«entrega lista» **más** `PAYOUT_HOLD_DAYS` (por defecto 5). Esto protege a EterClack de dispersar
dinero de un servicio que después se reclama o se reembolsa. Es el mecanismo que hace viable
sostener una política de reembolsos.

## B.7 KYC bancario del fotógrafo

No se dispersa a nadie sin datos verificados. Antes de la primera corrida, el perfil debe tener:

| Campo | Validación |
|---|---|
| Tipo de documento | CC, NIT o CE |
| Número de documento | Formato válido; coincide con el titular de la cuenta |
| Banco | De `GET /banks` — nunca texto libre |
| Tipo de cuenta | Ahorros o corriente |
| Número de cuenta | 6–20 dígitos |
| Nombre del titular | Debe coincidir con el documento |
| Correo | Verificado |
| Aceptación de términos de dispersión | Con fecha y hora |

Reglas:

- Cambiar los datos bancarios **congela** las dispersiones hasta que el admin revalide. Es la
  defensa contra el fraude por toma de cuenta: un atacante que entra a la cuenta de un fotógrafo no
  puede redirigir el dinero sin pasar por una persona.
- Primera dispersión a una cuenta nueva: monto pequeño de verificación, o revisión manual.
- Alternativa a evaluar en S7: **llaves Bre-B**, que evitan pedir y custodiar datos bancarios
  completos. Menos datos sensibles almacenados es menos riesgo.

## B.8 La corrida de dispersión

```
Cron  PAYOUT_RUN_CRON  (por defecto miércoles 9:00)
      │
      ▼
1. Seleccionar saldos en `disponible` con monto ≥ PAYOUT_MIN_AMOUNT_CENTS
2. Agrupar por fotógrafo (un solo pago aunque tenga varias órdenes)
3. Excluir a quien no tenga KYC bancario completo y verificado
4. Crear `payout_run` en estado `borrador` con sus `payout_items`
      │
      ▼
5. ¿PAYOUTS_REQUIRE_ADMIN_APPROVAL?
      ├── sí (MVP) → esperar aprobación explícita del admin en el panel
      └── no       → continuar
      │
      ▼
6. Marcar saldos como `programado`; generar idempotency key por ítem
7. POST al lote de Wompi
8. Guardar respuesta cruda; marcar `en_proceso`
      │
      ▼
9. Consultar estado cada 30 min (y atender eventos si están disponibles)
      ├── ítem OK      → `pagado`, asiento de liquidación, correo al fotógrafo
      └── ítem fallido → `fallido`, motivo, correo al fotógrafo y al admin,
                         saldo vuelve a `disponible`
      │
      ▼
10. Cerrar la corrida; generar reporte descargable en CSV
```

**En el MVP, `PAYOUTS_REQUIRE_ADMIN_APPROVAL=true`.** Un humano mira los montos antes de que salga
dinero real. Se puede automatizar del todo después del piloto, cuando haya confianza en los números.

## B.9 Idempotencia — la regla más importante

> **Un error aquí paga dos veces. No hay forma elegante de recuperarse de eso.**

- La llave de idempotencia es **determinista**, derivada del contenido, no aleatoria:
  `payout:{runId}:{photographerId}:{amountInCents}`. Un reintento genera exactamente la misma llave.
- Vence a las 24 horas (según Wompi). Un reintento posterior necesita una llave nueva **y**
  verificación previa contra Wompi de que el pago original no se ejecutó.
- Antes de reintentar cualquier ítem: **consultar primero** el estado en Wompi. Nunca reintentar a
  ciegas.
- `payout_items` tiene índice único sobre `(run_id, photographer_id)`.
- Todo monto es `bigint` en centavos. Cero aritmética de punto flotante en el camino del dinero.

## B.10 Conciliación diaria

Tarea automática a las 7:00:

1. `GET /payouts/reports` del día anterior.
2. Comparar contra `payout_items` locales.
3. Cualquier diferencia —monto, estado o ítem faltante en cualquiera de los dos lados— genera
   **alerta crítica** al admin y bloquea la siguiente corrida hasta que se resuelva.

Un descuadre sin resolver no debe acumularse silenciosamente durante semanas.

## B.11 Casos de prueba obligatorios (S7)

| # | Caso | Resultado esperado |
|---|---|---|
| 1 | Dispersión individual exitosa | Saldo `pagado`, asiento creado, correo enviado |
| 2 | Lote con 5 ítems, todos OK | `TOTAL_PAYMENT`, 5 saldos en `pagado` |
| 3 | Lote con 1 ítem fallido | `PARTIAL_PAYMENT`; 4 pagados, 1 vuelve a `disponible` con motivo |
| 4 | Misma llave de idempotencia dos veces | **Un solo pago**, segunda respuesta reconocida como duplicado |
| 5 | Datos bancarios inválidos | Rechazo previo al envío, sin llamada a la API |
| 6 | Fotógrafo sin KYC | Excluido de la corrida, con aviso |
| 7 | Saldo bajo el mínimo | Se acumula para la siguiente corrida |
| 8 | Saldo aún en ventana de retención | No entra en la corrida |
| 9 | Wompi caído durante la corrida | Corrida en `error`, reintentable sin duplicar |
| 10 | Conciliación con diferencia inyectada | Alerta crítica y bloqueo de la siguiente corrida |
| 11 | Reembolso posterior a la dispersión | Genera saldo negativo, se compensa contra el siguiente pago |
| 12 | Cambio de datos bancarios con corrida en curso | La corrida usa los datos con los que se armó; la siguiente exige revalidación |

---

## C. Obligaciones legales y tributarias

Cambiar de proveedor eliminó el bloqueo técnico. **No eliminó nada de esto**, y debe estar resuelto
antes de la primera dispersión con dinero real (tarea A4, semanas 2–6):

| Tema | Pregunta que el contador o abogado debe responder |
|---|---|
| Retención en la fuente | ¿EterClack debe practicar retefuente sobre los pagos a fotógrafos? ¿A qué tarifa según régimen? |
| ReteICA | ¿Aplica según el municipio de la operación? |
| Facturación | ¿El fotógrafo factura a EterClack, o EterClack factura al cliente por cuenta del fotógrafo? |
| RUT | ¿Se exige RUT vigente a cada fotógrafo antes de dispersar? |
| Naturaleza jurídica | ¿EterClack actúa como mandatario, intermediario o comisionista? Define el tratamiento fiscal completo |
| Reembolsos | ¿Qué pasa si hay que devolver dinero ya dispersado? ¿Quién asume la pérdida? |
| Información exógena | ¿Qué debe reportarse a la DIAN y con qué periodicidad? |
| Contracargos | ¿Quién responde ante un contracargo posterior a la dispersión? |

> La plataforma debe poder **configurar** retenciones por fotógrafo (campo `withholding_bps`) para
> aplicarlas cuando la respuesta llegue. Se diseña el campo desde S7 aunque se use en cero: agregarlo
> después obliga a recalcular saldos históricos.

---

## D. Fuentes

- Wompi — Ambientes y llaves: https://docs.wompi.co/docs/colombia/ambientes-y-llaves/
- Wompi — Widget y Checkout Web (firma de integridad): https://docs.wompi.co/docs/colombia/widget-checkout-web/
- Wompi — Eventos y validación de checksum: https://docs.wompi.co/docs/colombia/eventos/
- Wompi — Pagos a Terceros, introducción: https://docs.wompi.co/en/docs/colombia/introduccion-pagos-a-terceros/
- Wompi — Pagos a Terceros, activación: https://docs.wompi.co/en/docs/colombia/activacion-pagos-a-terceros/
- Wompi — Pagos a Terceros, ambientes y llaves: https://docs.wompi.co/en/docs/colombia/ambientes-y-llaves-pagos-a-terceros/
- Wompi — Pagos a Terceros, referencia de API: https://docs.wompi.co/en/docs/colombia/referencia-pagos-a-terceros/
- Wompi — Payouts (comercial): https://wompi.com/es/co/soluciones/payouts.html

Consulta realizada el 22 de agosto de 2026. Las tarifas, límites y condiciones de Wompi están sujetos
a cambio; confirmar en el panel del comercio antes de contratar.
