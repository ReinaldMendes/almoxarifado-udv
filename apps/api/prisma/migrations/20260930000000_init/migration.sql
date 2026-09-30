-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'GESTOR', 'CONSULTA');
CREATE TYPE "MovementType" AS ENUM ('ENTRADA', 'SAIDA', 'DEVOLUCAO', 'AJUSTE', 'PERDA', 'AVARIA');
CREATE TYPE "WithdrawalStatus" AS ENUM ('RETIRADO', 'AGUARDANDO_DEVOLUCAO', 'DEVOLVIDO', 'PENDENTE', 'CANCELADO', 'EXTRAVIADO', 'DANIFICADO', 'COBRANCA');
CREATE TYPE "ChargeStatus" AS ENUM ('SEM_COBRANCA', 'PENDENTE_DE_COBRANCA', 'COBRANCA_REALIZADA', 'REGULARIZADO');
CREATE TYPE "ReturnCondition" AS ENUM ('DEVOLVIDO_BOM_ESTADO', 'DEVOLVIDO_COM_AVARIA', 'NAO_DEVOLVIDO', 'DEVOLVIDO_PARCIALMENTE');
CREATE TYPE "AuditAction" AS ENUM ('LOGIN', 'CRIAR_ITEM', 'EDITAR_ITEM', 'DESATIVAR_ITEM', 'ENTRADA_ESTOQUE', 'AJUSTE_ESTOQUE', 'REGISTRAR_DEVOLUCAO', 'ALTERAR_STATUS', 'CRIAR_USUARIO', 'EDITAR_USUARIO');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "role" "Role" NOT NULL DEFAULT 'CONSULTA',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "lastLoginAt" TIMESTAMP(3),
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Item" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "categoryId" TEXT NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'UN',
    "currentStock" INTEGER NOT NULL DEFAULT 0,
    "minStock" INTEGER NOT NULL DEFAULT 0,
    "location" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "allowPublicWithdraw" BOOLEAN NOT NULL DEFAULT true,
    "requiresReturn" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Item_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Item_currentStock_nonneg" CHECK ("currentStock" >= 0)
);

CREATE TABLE "StockMovement" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "type" "MovementType" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "previousStock" INTEGER NOT NULL,
    "newStock" INTEGER NOT NULL,
    "userId" TEXT,
    "personName" TEXT,
    "origin" TEXT,
    "reference" TEXT,
    "note" TEXT,
    "protocol" TEXT,
    "withdrawalId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "StockMovement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Withdrawal" (
    "id" TEXT NOT NULL,
    "protocol" TEXT NOT NULL,
    "personName" TEXT NOT NULL,
    "withdrawnAt" TIMESTAMP(3) NOT NULL,
    "status" "WithdrawalStatus" NOT NULL DEFAULT 'RETIRADO',
    "notes" TEXT,
    "adminNotes" TEXT,
    "requesterIpHash" TEXT,
    "chargeStatus" "ChargeStatus" NOT NULL DEFAULT 'SEM_COBRANCA',
    "chargeAmount" DECIMAL(10,2),
    "chargeDate" TIMESTAMP(3),
    "chargeNote" TEXT,
    "chargeResponsibleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Withdrawal_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WithdrawalItem" (
    "id" TEXT NOT NULL,
    "withdrawalId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "returnedQuantity" INTEGER NOT NULL DEFAULT 0,
    "requiresReturn" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WithdrawalItem_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Return" (
    "id" TEXT NOT NULL,
    "withdrawalItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "condition" "ReturnCondition" NOT NULL,
    "returnedAt" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Return_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entity" TEXT,
    "entityId" TEXT,
    "data" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ProtocolCounter" (
    "key" TEXT NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "ProtocolCounter_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE INDEX "User_active_idx" ON "User"("active");
CREATE UNIQUE INDEX "Category_name_key" ON "Category"("name");
CREATE UNIQUE INDEX "Item_code_key" ON "Item"("code");
CREATE INDEX "Item_categoryId_idx" ON "Item"("categoryId");
CREATE INDEX "Item_active_allowPublicWithdraw_idx" ON "Item"("active", "allowPublicWithdraw");
CREATE INDEX "Item_name_idx" ON "Item"("name");
CREATE INDEX "StockMovement_itemId_idx" ON "StockMovement"("itemId");
CREATE INDEX "StockMovement_userId_idx" ON "StockMovement"("userId");
CREATE INDEX "StockMovement_withdrawalId_idx" ON "StockMovement"("withdrawalId");
CREATE INDEX "StockMovement_type_idx" ON "StockMovement"("type");
CREATE INDEX "StockMovement_createdAt_idx" ON "StockMovement"("createdAt");
CREATE INDEX "StockMovement_protocol_idx" ON "StockMovement"("protocol");
CREATE UNIQUE INDEX "Withdrawal_protocol_key" ON "Withdrawal"("protocol");
CREATE INDEX "Withdrawal_status_idx" ON "Withdrawal"("status");
CREATE INDEX "Withdrawal_createdAt_idx" ON "Withdrawal"("createdAt");
CREATE INDEX "Withdrawal_personName_idx" ON "Withdrawal"("personName");
CREATE INDEX "Withdrawal_chargeStatus_idx" ON "Withdrawal"("chargeStatus");
CREATE INDEX "WithdrawalItem_withdrawalId_idx" ON "WithdrawalItem"("withdrawalId");
CREATE INDEX "WithdrawalItem_itemId_idx" ON "WithdrawalItem"("itemId");
CREATE INDEX "Return_withdrawalItemId_idx" ON "Return"("withdrawalItemId");
CREATE INDEX "Return_userId_idx" ON "Return"("userId");
CREATE INDEX "Return_createdAt_idx" ON "Return"("createdAt");
CREATE INDEX "AuditLog_userId_idx" ON "AuditLog"("userId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- AddForeignKey
ALTER TABLE "Item" ADD CONSTRAINT "Item_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "StockMovement" ADD CONSTRAINT "StockMovement_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Withdrawal" ADD CONSTRAINT "Withdrawal_chargeResponsibleId_fkey" FOREIGN KEY ("chargeResponsibleId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WithdrawalItem" ADD CONSTRAINT "WithdrawalItem_withdrawalId_fkey" FOREIGN KEY ("withdrawalId") REFERENCES "Withdrawal"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "WithdrawalItem" ADD CONSTRAINT "WithdrawalItem_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Return" ADD CONSTRAINT "Return_withdrawalItemId_fkey" FOREIGN KEY ("withdrawalItemId") REFERENCES "WithdrawalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Return" ADD CONSTRAINT "Return_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
