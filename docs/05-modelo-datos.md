# 05 — Modelo de datos

PostgreSQL 16 + Prisma 6. Reemplaza el diseño sobre Cloudflare D1 de la cotización.

## 0. Convenciones

| Regla | Motivo |
|---|---|
| Identificadores UUID v7 | Ordenables por tiempo, no adivinables, seguros para exponer en URLs |
| Dinero: `BigInt` en **centavos** | Cero errores de punto flotante. `COP $50.000` = `5000000` |
| Tasas: `Int` en **puntos base** | 15 % = `1500`. Sin decimales en ninguna parte |
| Fechas: `timestamptz` en UTC | Se convierte a `America/Bogota` solo al presentar |
| Borrado: `deleted_at` lógico | Nada se borra de verdad; hay trazabilidad legal que preservar |
| Auditoría: `created_at`, `updated_at`, `created_by` | En toda tabla operativa |
| Enums: en la base de datos | Un estado inválido debe ser imposible, no solo improbable |

---

## 1. Máquinas de estado

Se conservan exactamente las de la cotización, con dos añadidos por la dispersión.

### Solicitud
```
nueva → en_revision → propuesta → aceptada
                   ↘ rechazada
                   ↘ vencida
```

### Orden
```
borrador → contrato_aceptado → pago_pendiente → reservada
        → en_produccion → seleccion → entrega_lista → completada
                                                   ↘ cancelada
```

### Pago
```
iniciado → pendiente → aprobado
                    ↘ rechazado → (reintento con NUEVA referencia)
                    ↘ expirado
         aprobado → reembolsado  (operación administrativa, asiento propio)
```

### Galería
```
borrador → publicada → seleccion_cerrada → entrega_final → archivada
```

### Saldo del fotógrafo *(reemplaza «Liquidación» de la cotización)*
```
retenido → disponible → programado → en_proceso → pagado
                                               ↘ fallido → disponible
        cualquiera → ajustado  (solo admin, motivo obligatorio)
```

### Corrida de dispersión *(nuevo)*
```
borrador → aprobada → enviada → parcial → completada
                             ↘ error → reintentada
```

**Regla transversal:** toda transición se ejecuta dentro de una transacción de base de datos, valida
que el estado de origen sea legal y escribe en `audit_log`. Nunca un `UPDATE` suelto sobre una
columna de estado.

---

## 2. Esquema Prisma (núcleo)

```prisma
// ─── Identidad ────────────────────────────────────────────────
enum Role { CLIENT PHOTOGRAPHER ADMIN }

model User {
  id                String    @id @default(dbgenerated("uuid_generate_v7()")) @db.Uuid
  email             String    @unique
  emailVerifiedAt   DateTime?
  passwordHash      String
  role              Role
  fullName          String
  phone             String?
  status            UserStatus @default(ACTIVE)   // ACTIVE SUSPENDED DELETED
  consentAcceptedAt DateTime?
  createdAt         DateTime  @default(now())
  updatedAt         DateTime  @updatedAt
  deletedAt         DateTime?

  photographer      PhotographerProfile?
  sessions          Session[]
  @@index([role, status])
}

model Session {
  id            String   @id @db.Uuid
  userId        String   @db.Uuid
  refreshHash   String                       // el token nunca se guarda en claro
  userAgent     String?
  ip            String?
  expiresAt     DateTime
  revokedAt     DateTime?
  user          User     @relation(fields: [userId], references: [id])
  @@index([userId, revokedAt])
}

// ─── Fotógrafo ────────────────────────────────────────────────
enum PhotographerStatus { PENDING APPROVED REJECTED SUSPENDED }

model PhotographerProfile {
  id                String   @id @db.Uuid
  userId            String   @unique @db.Uuid
  bio               String?
  status            PhotographerStatus @default(PENDING)
  approvedAt        DateTime?
  approvedBy        String?  @db.Uuid
  rejectionReason   String?
  priceFromCents    BigInt?
  commissionBps     Int?                      // nulo = usa la comisión global

  // KYC bancario — sin esto no hay dispersión (ver 04-wompi §B.7)
  legalIdType       String?                   // CC | NIT | CE
  legalIdNumber     String?
  bankId            String?                   // catálogo de GET /banks
  bankAccountType   String?                   // SAVINGS | CHECKING
  bankAccountNumber String?
  bankHolderName    String?
  withholdingBps    Int      @default(0)      // retención; ver 04-wompi §C
  bankVerifiedAt    DateTime?
  bankVerifiedBy    String?  @db.Uuid
  payoutsFrozen     Boolean  @default(false)  // se activa al cambiar datos bancarios

  user              User     @relation(fields: [userId], references: [id])
  specialties       PhotographerSpecialty[]
  zones             PhotographerZone[]
  packages          Package[]
  availability      AvailabilityBlock[]
  @@index([status])
}

model Specialty { id String @id @db.Uuid  slug String @unique  name String  active Boolean @default(true) }
model Zone      { id String @id @db.Uuid  slug String @unique  name String  department String  active Boolean @default(true) }

model Package {
  id                String  @id @db.Uuid
  photographerId    String  @db.Uuid
  name              String
  description       String?
  priceCents        BigInt
  maxSelectablePhotos Int                     // límite de selección del cliente
  deliveryDays      Int
  active            Boolean @default(true)
}

model AvailabilityBlock {
  id             String   @id @db.Uuid
  photographerId String   @db.Uuid
  date           DateTime @db.Date
  available      Boolean
  reason         String?
  orderId        String?  @db.Uuid            // bloqueo por reserva confirmada
  @@unique([photographerId, date])
}

// ─── Solicitud y orden ────────────────────────────────────────
model Request {
  id             String   @id @db.Uuid
  clientId       String   @db.Uuid
  photographerId String   @db.Uuid
  status         RequestStatus @default(NUEVA)
  eventDate      DateTime @db.Date
  zoneId         String   @db.Uuid
  specialtyId    String   @db.Uuid
  packageId      String?  @db.Uuid
  budgetCents    BigInt?
  description    String
  proposalCents  BigInt?                      // contrapropuesta del fotógrafo
  proposalNote   String?
  expiresAt      DateTime
  @@index([photographerId, status])
  @@index([clientId, status])
}

model Order {
  id                String   @id @db.Uuid
  code              String   @unique          // ETC-2026-000123, visible al usuario
  requestId         String   @unique @db.Uuid
  clientId          String   @db.Uuid
  photographerId    String   @db.Uuid
  status            OrderStatus @default(BORRADOR)
  eventDate         DateTime @db.Date
  amountCents       BigInt                    // fuente de verdad del monto a cobrar
  commissionBps     Int                       // congelada al crear la orden
  commissionCents   BigInt
  photographerCents BigInt                    // amountCents − commissionCents
  currency          String   @default("COP")
  deliveryReadyAt   DateTime?                 // arranca la ventana de retención
  completedAt       DateTime?
  cancelledAt       DateTime?
  cancelReason      String?
  @@index([status, eventDate])
}
```

> **`commissionBps` se congela en la orden.** Si mañana el admin cambia la comisión global de 15 % a
> 18 %, las órdenes existentes conservan la que se pactó. Recalcular históricos sería, además de un
> error de software, un problema contractual.

```prisma
// ─── Contrato ─────────────────────────────────────────────────
model ContractTemplate {
  id        String   @id @db.Uuid
  version   Int      @unique
  bodyMd    String                            // markdown con {{variables}}
  activeFrom DateTime
}

model ContractAcceptance {
  id            String   @id @db.Uuid
  orderId       String   @unique @db.Uuid
  templateVersion Int
  renderedBody  String                        // texto EXACTO que el cliente vio
  pdfKey        String                        // objeto en MinIO
  acceptedByName String
  acceptedAt    DateTime
  ip            String
  userAgent     String
}
```

> `renderedBody` guarda el texto ya resuelto, no la plantilla. Es la única forma de probar
> —meses después, ante un reclamo— qué aceptó exactamente esa persona ese día.

```prisma
// ─── Pagos (Wompi recaudo) ────────────────────────────────────
model Payment {
  id                 String   @id @db.Uuid
  orderId            String   @db.Uuid
  attempt            Int
  reference          String   @unique         // ETC-{orderId}-{attempt}-{nanoid}
  amountCents        BigInt
  status             PaymentStatus @default(INICIADO)
  wompiTransactionId String?  @unique
  paymentMethod      String?                  // CARD PSE NEQUI BANCOLOMBIA_TRANSFER…
  approvedAt         DateTime?
  rawResponse        Json?
  @@index([orderId, status])
}

model WompiEvent {
  id            String   @id @db.Uuid
  eventType     String
  transactionId String?
  status        String?
  timestamp     BigInt
  checksumValid Boolean
  payload       Json                          // evento crudo, íntegro
  processedAt   DateTime?
  receivedAt    DateTime @default(now())
  @@unique([transactionId, status, timestamp])   // ← la idempotencia vive aquí
  @@index([eventType, receivedAt])
}
```

```prisma
// ─── Libro contable y dispersión ──────────────────────────────
enum LedgerEntryType {
  ORDER_PAYMENT          // + entra dinero del cliente
  PLATFORM_FEE           // − comisión de EterClack
  PHOTOGRAPHER_PAYABLE   // − deuda con el fotógrafo
  PAYOUT_SETTLEMENT      // + se salda al dispersar
  REFUND                 // − devolución al cliente
  ADJUSTMENT             // ± corrección manual del admin
  WITHHOLDING            // − retención tributaria
}

model LedgerEntry {
  id             String   @id @db.Uuid
  type           LedgerEntryType
  orderId        String?  @db.Uuid
  photographerId String?  @db.Uuid
  paymentId      String?  @db.Uuid
  payoutItemId   String?  @db.Uuid
  amountCents    BigInt                       // firmado: + entra, − sale
  balanceState   BalanceState?                // RETENIDO DISPONIBLE PROGRAMADO EN_PROCESO PAGADO FALLIDO AJUSTADO
  availableAt    DateTime?                    // fin de la ventana de retención
  description    String
  createdBy      String?  @db.Uuid
  createdAt      DateTime @default(now())
  @@index([photographerId, balanceState])
  @@index([orderId])
}

model PayoutRun {
  id           String   @id @db.Uuid
  code         String   @unique               // PR-2026-W34
  status       PayoutRunStatus @default(BORRADOR)
  totalCents   BigInt
  itemCount    Int
  approvedBy   String?  @db.Uuid
  approvedAt   DateTime?
  wompiBatchId String?
  wompiStatus  String?                        // PENDING PARTIAL_PAYMENT TOTAL_PAYMENT
  sentAt       DateTime?
  closedAt     DateTime?
  items        PayoutItem[]
}

model PayoutItem {
  id             String   @id @db.Uuid
  runId          String   @db.Uuid
  photographerId String   @db.Uuid
  amountCents    BigInt
  reference      String   @unique             // PO-2026-000123
  idempotencyKey String   @unique             // payout:{runId}:{photographerId}:{amountCents}
  status         PayoutItemStatus @default(PENDIENTE)
  failureReason  String?
  retryCount     Int      @default(0)
  wompiPayoutId  String?
  paidAt         DateTime?
  rawResponse    Json?
  bankSnapshot   Json                         // datos bancarios usados EN ESE MOMENTO
  run            PayoutRun @relation(fields: [runId], references: [id])
  @@unique([runId, photographerId])           // ← nunca dos pagos al mismo fotógrafo en una corrida
}
```

> `bankSnapshot` congela los datos bancarios usados. Si el fotógrafo los cambia después, sigue siendo
> posible saber a qué cuenta se envió realmente cada peso.

```prisma
// ─── Galerías y entrega ───────────────────────────────────────
model Gallery {
  id          String   @id @db.Uuid
  orderId     String   @unique @db.Uuid
  status      GalleryStatus @default(BORRADOR)
  publishedAt DateTime?
  closedAt    DateTime?
  photos      Photo[]
}

model Photo {
  id           String   @id @db.Uuid
  galleryId    String   @db.Uuid
  kind         PhotoKind                      // PROOF | FINAL
  originalKey  String                         // projects/{orderId}/originals/{uuid}.jpg
  thumbKey     String?
  previewKey   String?
  filename     String
  sizeBytes    BigInt
  mimeType     String
  width        Int?
  height       Int?
  sortOrder    Int      @default(0)
  processedAt  DateTime?
  @@index([galleryId, kind, sortOrder])
}

model Selection {
  id          String   @id @db.Uuid
  galleryId   String   @unique @db.Uuid
  submittedAt DateTime?
  items       SelectionItem[]
}

model SelectionItem {
  id          String  @id @db.Uuid
  selectionId String  @db.Uuid
  photoId     String  @db.Uuid
  favorite    Boolean @default(false)
  finalPick   Boolean @default(false)
  comment     String?
  @@unique([selectionId, photoId])
}

model Download {
  id         String   @id @db.Uuid
  orderId    String   @db.Uuid
  userId     String   @db.Uuid
  photoId    String?  @db.Uuid
  kind       String                           // SINGLE | ZIP
  ip         String
  createdAt  DateTime @default(now())
  @@index([orderId, createdAt])
}

// ─── Correo ───────────────────────────────────────────────────
model Email {
  id         String   @id @db.Uuid
  template   String
  toAddress  String
  subject    String
  status     EmailStatus @default(QUEUED)     // QUEUED SENT FAILED SUPPRESSED
  priority   Int      @default(5)
  messageId  String?
  attempts   Int      @default(0)
  error      String?
  sentAt     DateTime?
  @@index([status, priority, createdAt])
}

model EmailSuppression {
  address   String   @id
  reason    String                            // HARD_BOUNCE SOFT_BOUNCE_LIMIT COMPLAINT MANUAL
  detail    String?
  permanent Boolean  @default(true)
  createdAt DateTime @default(now())
}

// ─── Auditoría y configuración ────────────────────────────────
model AuditLog {
  id         String   @id @db.Uuid
  actorId    String?  @db.Uuid
  actorRole  Role?
  action     String                           // order.status_changed, payout.approved…
  entityType String
  entityId   String
  before     Json?
  after      Json?
  ip         String?
  createdAt  DateTime @default(now())
  @@index([entityType, entityId, createdAt])
  @@index([actorId, createdAt])
}

model Setting {
  key       String   @id                      // platform_commission_bps, payout_hold_days…
  value     Json
  updatedBy String?  @db.Uuid
  updatedAt DateTime @updatedAt
}
```

---

## 3. Invariantes que las pruebas deben verificar

Estas son las afirmaciones que, si dejan de ser ciertas, significan que hay dinero o datos mal:

1. **El libro cuadra.** Para cada orden, `SUM(ledger_entries.amount_cents) = 0` una vez liquidada.
2. **La comisión cuadra.** `order.amountCents = order.commissionCents + order.photographerCents`, siempre.
3. **No hay pago doble.** `payout_items` no admite dos filas con la misma `idempotencyKey`, ni dos
   con el mismo `(runId, photographerId)`.
4. **La retención se respeta.** Ningún saldo pasa a `disponible` antes de
   `deliveryReadyAt + PAYOUT_HOLD_DAYS`.
5. **Sin KYC no hay dinero.** Ningún `payout_item` para un fotógrafo con `bankVerifiedAt = null` o
   `payoutsFrozen = true`.
6. **El webhook es la única autoridad.** Ninguna orden llega a `reservada` sin un `WompiEvent` con
   `checksumValid = true` y estado `APPROVED`.
7. **El contrato es inmutable.** `ContractAcceptance` nunca se actualiza tras crearse.
8. **Aislamiento de galerías.** Una consulta de fotos siempre filtra por propiedad del recurso; un
   `photoId` válido de otra orden devuelve 403, no la foto.
9. **Toda transición queda registrada.** Cada cambio de estado tiene su fila en `audit_log`.
10. **Nunca se envía a una dirección suprimida.** `MailService` consulta `EmailSuppression` antes de
    encolar.

---

## 4. Índices y rendimiento

| Consulta | Índice |
|---|---|
| Búsqueda de fotógrafos con filtros | `GIN` sobre especialidades y zonas; parcial sobre `status = APPROVED` |
| Tablero de leads del fotógrafo | `(photographerId, status)` |
| Órdenes por estado en el admin | `(status, eventDate)` |
| Saldo disponible de un fotógrafo | `(photographerId, balanceState)` |
| Fotos de una galería | `(galleryId, kind, sortOrder)` |
| Búsqueda de eventos Wompi | `(transactionId)`, `(eventType, receivedAt)` |
| Cola de correo | `(status, priority, createdAt)` |

Búsqueda de texto: `pg_trgm` sobre nombre y biografía. Suficiente para el MVP; si el catálogo crece
mucho, el reemplazo natural es un índice externo, no un rediseño del esquema.
