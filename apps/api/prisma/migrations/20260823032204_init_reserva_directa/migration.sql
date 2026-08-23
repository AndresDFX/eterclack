-- CreateEnum
CREATE TYPE "Role" AS ENUM ('CLIENT', 'PHOTOGRAPHER', 'ADMIN');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'DELETED');

-- CreateEnum
CREATE TYPE "TokenPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "PhotographerStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "PackageTier" AS ENUM ('ECONOMICO', 'MEDIO', 'ALTO');

-- CreateEnum
CREATE TYPE "SlotTurn" AS ENUM ('MANANA', 'TARDE', 'DIA_COMPLETO');

-- CreateEnum
CREATE TYPE "SlotStatus" AS ENUM ('DISPONIBLE', 'RETENIDA', 'RESERVADA');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('BORRADOR', 'CONTRATO_ACEPTADO', 'PAGO_PENDIENTE', 'RESERVADA', 'EN_PRODUCCION', 'SELECCION', 'ENTREGA_LISTA', 'COMPLETADA', 'CANCELADA');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INICIADO', 'PENDIENTE', 'APROBADO', 'RECHAZADO', 'ANULADO', 'EXPIRADO', 'ERROR', 'REEMBOLSADO');

-- CreateEnum
CREATE TYPE "LedgerEntryType" AS ENUM ('ORDER_PAYMENT', 'PLATFORM_FEE', 'PHOTOGRAPHER_PAYABLE', 'PAYOUT_SETTLEMENT', 'REFUND', 'ADJUSTMENT', 'WITHHOLDING');

-- CreateEnum
CREATE TYPE "BalanceState" AS ENUM ('RETENIDO', 'DISPONIBLE', 'PROGRAMADO', 'EN_PROCESO', 'PAGADO', 'FALLIDO', 'AJUSTADO');

-- CreateEnum
CREATE TYPE "PayoutRunStatus" AS ENUM ('BORRADOR', 'APROBADA', 'ENVIADA', 'PARCIAL', 'COMPLETADA', 'ERROR');

-- CreateEnum
CREATE TYPE "PayoutItemStatus" AS ENUM ('PENDIENTE', 'ENVIADO', 'PAGADO', 'FALLIDO');

-- CreateEnum
CREATE TYPE "GalleryStatus" AS ENUM ('BORRADOR', 'PUBLICADA', 'SELECCION_CERRADA', 'ENTREGA_FINAL', 'ARCHIVADA');

-- CreateEnum
CREATE TYPE "PhotoKind" AS ENUM ('PROOF', 'FINAL');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('QUEUED', 'SENT', 'FAILED', 'SUPPRESSED');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "consentAcceptedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ip" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "purpose" "TokenPurpose" NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Specialty" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Specialty_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Zone" (
    "id" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "department" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "Zone_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotographerProfile" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "slug" TEXT NOT NULL,
    "headline" TEXT,
    "bio" TEXT,
    "status" "PhotographerStatus" NOT NULL DEFAULT 'PENDING',
    "approvedAt" TIMESTAMP(3),
    "approvedBy" UUID,
    "rejectionReason" TEXT,
    "priceFromCents" BIGINT,
    "commissionBps" INTEGER,
    "avatarKey" TEXT,
    "coverKey" TEXT,
    "instagram" TEXT,
    "website" TEXT,
    "legalIdType" TEXT,
    "legalIdNumber" TEXT,
    "bankId" TEXT,
    "bankAccountType" TEXT,
    "bankAccountNumber" TEXT,
    "bankHolderName" TEXT,
    "withholdingBps" INTEGER NOT NULL DEFAULT 0,
    "bankVerifiedAt" TIMESTAMP(3),
    "bankVerifiedBy" UUID,
    "payoutsFrozen" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PhotographerProfile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PhotographerSpecialty" (
    "photographerId" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,

    CONSTRAINT "PhotographerSpecialty_pkey" PRIMARY KEY ("photographerId","specialtyId")
);

-- CreateTable
CREATE TABLE "PhotographerZone" (
    "photographerId" UUID NOT NULL,
    "zoneId" UUID NOT NULL,

    CONSTRAINT "PhotographerZone_pkey" PRIMARY KEY ("photographerId","zoneId")
);

-- CreateTable
CREATE TABLE "PortfolioItem" (
    "id" UUID NOT NULL,
    "photographerId" UUID NOT NULL,
    "imageKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "caption" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PortfolioItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" UUID NOT NULL,
    "photographerId" UUID NOT NULL,
    "tier" "PackageTier" NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "includes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "priceCents" BIGINT NOT NULL,
    "maxSelectablePhotos" INTEGER NOT NULL,
    "deliveryDays" INTEGER NOT NULL,
    "hours" INTEGER NOT NULL DEFAULT 4,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AvailabilitySlot" (
    "id" UUID NOT NULL,
    "photographerId" UUID NOT NULL,
    "date" DATE NOT NULL,
    "turn" "SlotTurn" NOT NULL DEFAULT 'DIA_COMPLETO',
    "status" "SlotStatus" NOT NULL DEFAULT 'DISPONIBLE',
    "note" TEXT,
    "holdExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AvailabilitySlot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Order" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" UUID NOT NULL,
    "photographerId" UUID NOT NULL,
    "packageId" UUID NOT NULL,
    "slotId" UUID NOT NULL,
    "zoneId" UUID NOT NULL,
    "specialtyId" UUID NOT NULL,
    "status" "OrderStatus" NOT NULL DEFAULT 'BORRADOR',
    "eventDate" DATE NOT NULL,
    "notes" TEXT,
    "amountCents" BIGINT NOT NULL,
    "commissionBps" INTEGER NOT NULL,
    "commissionCents" BIGINT NOT NULL,
    "photographerCents" BIGINT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'COP',
    "maxSelectablePhotos" INTEGER NOT NULL DEFAULT 0,
    "deliveryReadyAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Order_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractTemplate" (
    "id" UUID NOT NULL,
    "version" INTEGER NOT NULL,
    "title" TEXT NOT NULL,
    "bodyMd" TEXT NOT NULL,
    "activeFrom" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractAcceptance" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "templateVersion" INTEGER NOT NULL,
    "renderedBody" TEXT NOT NULL,
    "pdfKey" TEXT,
    "acceptedByName" TEXT NOT NULL,
    "acceptedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT NOT NULL,
    "userAgent" TEXT NOT NULL,

    CONSTRAINT "ContractAcceptance_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "attempt" INTEGER NOT NULL DEFAULT 1,
    "reference" TEXT NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INICIADO',
    "wompiTransactionId" TEXT,
    "paymentMethod" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rawResponse" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WompiEvent" (
    "id" UUID NOT NULL,
    "eventType" TEXT NOT NULL,
    "transactionId" TEXT,
    "status" TEXT,
    "timestamp" BIGINT NOT NULL,
    "checksumValid" BOOLEAN NOT NULL,
    "payload" JSONB NOT NULL,
    "processedAt" TIMESTAMP(3),
    "error" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WompiEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LedgerEntry" (
    "id" UUID NOT NULL,
    "type" "LedgerEntryType" NOT NULL,
    "orderId" UUID,
    "photographerId" UUID,
    "paymentId" UUID,
    "payoutItemId" UUID,
    "amountCents" BIGINT NOT NULL,
    "balanceState" "BalanceState",
    "availableAt" TIMESTAMP(3),
    "description" TEXT NOT NULL,
    "createdBy" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LedgerEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutRun" (
    "id" UUID NOT NULL,
    "code" TEXT NOT NULL,
    "status" "PayoutRunStatus" NOT NULL DEFAULT 'BORRADOR',
    "totalCents" BIGINT NOT NULL DEFAULT 0,
    "itemCount" INTEGER NOT NULL DEFAULT 0,
    "approvedBy" UUID,
    "approvedAt" TIMESTAMP(3),
    "wompiBatchId" TEXT,
    "wompiStatus" TEXT,
    "sentAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PayoutItem" (
    "id" UUID NOT NULL,
    "runId" UUID NOT NULL,
    "photographerId" UUID NOT NULL,
    "amountCents" BIGINT NOT NULL,
    "reference" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "status" "PayoutItemStatus" NOT NULL DEFAULT 'PENDIENTE',
    "failureReason" TEXT,
    "retryCount" INTEGER NOT NULL DEFAULT 0,
    "wompiPayoutId" TEXT,
    "paidAt" TIMESTAMP(3),
    "rawResponse" JSONB,
    "bankSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PayoutItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Gallery" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "status" "GalleryStatus" NOT NULL DEFAULT 'BORRADOR',
    "title" TEXT,
    "publishedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Gallery_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Photo" (
    "id" UUID NOT NULL,
    "galleryId" UUID NOT NULL,
    "kind" "PhotoKind" NOT NULL DEFAULT 'PROOF',
    "originalKey" TEXT NOT NULL,
    "thumbKey" TEXT,
    "previewKey" TEXT,
    "filename" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "processedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Photo_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Selection" (
    "id" UUID NOT NULL,
    "galleryId" UUID NOT NULL,
    "submittedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Selection_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SelectionItem" (
    "id" UUID NOT NULL,
    "selectionId" UUID NOT NULL,
    "photoId" UUID NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "finalPick" BOOLEAN NOT NULL DEFAULT false,
    "comment" TEXT,

    CONSTRAINT "SelectionItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Download" (
    "id" UUID NOT NULL,
    "orderId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "photoId" UUID,
    "kind" TEXT NOT NULL DEFAULT 'SINGLE',
    "ip" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Download_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Email" (
    "id" UUID NOT NULL,
    "template" TEXT NOT NULL,
    "toAddress" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'QUEUED',
    "priority" INTEGER NOT NULL DEFAULT 5,
    "messageId" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "error" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Email_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailSuppression" (
    "address" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "detail" TEXT,
    "permanent" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailSuppression_pkey" PRIMARY KEY ("address")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" UUID NOT NULL,
    "actorId" UUID,
    "actorRole" "Role",
    "action" TEXT NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Setting" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updatedBy" UUID,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Setting_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_role_status_idx" ON "User"("role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Session_refreshHash_key" ON "Session"("refreshHash");

-- CreateIndex
CREATE INDEX "Session_userId_revokedAt_idx" ON "Session"("userId", "revokedAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_purpose_idx" ON "VerificationToken"("userId", "purpose");

-- CreateIndex
CREATE UNIQUE INDEX "Specialty_slug_key" ON "Specialty"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "Zone_slug_key" ON "Zone"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "PhotographerProfile_userId_key" ON "PhotographerProfile"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "PhotographerProfile_slug_key" ON "PhotographerProfile"("slug");

-- CreateIndex
CREATE INDEX "PhotographerProfile_status_idx" ON "PhotographerProfile"("status");

-- CreateIndex
CREATE INDEX "PhotographerSpecialty_specialtyId_idx" ON "PhotographerSpecialty"("specialtyId");

-- CreateIndex
CREATE INDEX "PhotographerZone_zoneId_idx" ON "PhotographerZone"("zoneId");

-- CreateIndex
CREATE INDEX "PortfolioItem_photographerId_sortOrder_idx" ON "PortfolioItem"("photographerId", "sortOrder");

-- CreateIndex
CREATE INDEX "Package_photographerId_active_idx" ON "Package"("photographerId", "active");

-- CreateIndex
CREATE UNIQUE INDEX "Package_photographerId_tier_key" ON "Package"("photographerId", "tier");

-- CreateIndex
CREATE INDEX "AvailabilitySlot_photographerId_date_status_idx" ON "AvailabilitySlot"("photographerId", "date", "status");

-- CreateIndex
CREATE UNIQUE INDEX "AvailabilitySlot_photographerId_date_turn_key" ON "AvailabilitySlot"("photographerId", "date", "turn");

-- CreateIndex
CREATE UNIQUE INDEX "Order_code_key" ON "Order"("code");

-- CreateIndex
CREATE UNIQUE INDEX "Order_slotId_key" ON "Order"("slotId");

-- CreateIndex
CREATE INDEX "Order_status_eventDate_idx" ON "Order"("status", "eventDate");

-- CreateIndex
CREATE INDEX "Order_clientId_status_idx" ON "Order"("clientId", "status");

-- CreateIndex
CREATE INDEX "Order_photographerId_status_idx" ON "Order"("photographerId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ContractTemplate_version_key" ON "ContractTemplate"("version");

-- CreateIndex
CREATE UNIQUE INDEX "ContractAcceptance_orderId_key" ON "ContractAcceptance"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_reference_key" ON "Payment"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_wompiTransactionId_key" ON "Payment"("wompiTransactionId");

-- CreateIndex
CREATE INDEX "Payment_orderId_status_idx" ON "Payment"("orderId", "status");

-- CreateIndex
CREATE INDEX "WompiEvent_eventType_receivedAt_idx" ON "WompiEvent"("eventType", "receivedAt");

-- CreateIndex
CREATE UNIQUE INDEX "WompiEvent_transactionId_status_timestamp_key" ON "WompiEvent"("transactionId", "status", "timestamp");

-- CreateIndex
CREATE INDEX "LedgerEntry_photographerId_balanceState_idx" ON "LedgerEntry"("photographerId", "balanceState");

-- CreateIndex
CREATE INDEX "LedgerEntry_orderId_idx" ON "LedgerEntry"("orderId");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutRun_code_key" ON "PayoutRun"("code");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutItem_reference_key" ON "PayoutItem"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutItem_idempotencyKey_key" ON "PayoutItem"("idempotencyKey");

-- CreateIndex
CREATE UNIQUE INDEX "PayoutItem_runId_photographerId_key" ON "PayoutItem"("runId", "photographerId");

-- CreateIndex
CREATE UNIQUE INDEX "Gallery_orderId_key" ON "Gallery"("orderId");

-- CreateIndex
CREATE INDEX "Photo_galleryId_kind_sortOrder_idx" ON "Photo"("galleryId", "kind", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Selection_galleryId_key" ON "Selection"("galleryId");

-- CreateIndex
CREATE UNIQUE INDEX "SelectionItem_selectionId_photoId_key" ON "SelectionItem"("selectionId", "photoId");

-- CreateIndex
CREATE INDEX "Download_orderId_createdAt_idx" ON "Download"("orderId", "createdAt");

-- CreateIndex
CREATE INDEX "Email_status_priority_createdAt_idx" ON "Email"("status", "priority", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_entityType_entityId_createdAt_idx" ON "AuditLog"("entityType", "entityId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_actorId_createdAt_idx" ON "AuditLog"("actorId", "createdAt");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotographerProfile" ADD CONSTRAINT "PhotographerProfile_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotographerSpecialty" ADD CONSTRAINT "PhotographerSpecialty_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "PhotographerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotographerSpecialty" ADD CONSTRAINT "PhotographerSpecialty_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotographerZone" ADD CONSTRAINT "PhotographerZone_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "PhotographerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PhotographerZone" ADD CONSTRAINT "PhotographerZone_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PortfolioItem" ADD CONSTRAINT "PortfolioItem_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "PhotographerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "PhotographerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AvailabilitySlot" ADD CONSTRAINT "AvailabilitySlot_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "PhotographerProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "PhotographerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "Package"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_slotId_fkey" FOREIGN KEY ("slotId") REFERENCES "AvailabilitySlot"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Order" ADD CONSTRAINT "Order_specialtyId_fkey" FOREIGN KEY ("specialtyId") REFERENCES "Specialty"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContractAcceptance" ADD CONSTRAINT "ContractAcceptance_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "PhotographerProfile"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LedgerEntry" ADD CONSTRAINT "LedgerEntry_payoutItemId_fkey" FOREIGN KEY ("payoutItemId") REFERENCES "PayoutItem"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutItem" ADD CONSTRAINT "PayoutItem_runId_fkey" FOREIGN KEY ("runId") REFERENCES "PayoutRun"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PayoutItem" ADD CONSTRAINT "PayoutItem_photographerId_fkey" FOREIGN KEY ("photographerId") REFERENCES "PhotographerProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Gallery" ADD CONSTRAINT "Gallery_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Photo" ADD CONSTRAINT "Photo_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Selection" ADD CONSTRAINT "Selection_galleryId_fkey" FOREIGN KEY ("galleryId") REFERENCES "Gallery"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionItem" ADD CONSTRAINT "SelectionItem_selectionId_fkey" FOREIGN KEY ("selectionId") REFERENCES "Selection"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SelectionItem" ADD CONSTRAINT "SelectionItem_photoId_fkey" FOREIGN KEY ("photoId") REFERENCES "Photo"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Download" ADD CONSTRAINT "Download_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order"("id") ON DELETE CASCADE ON UPDATE CASCADE;
