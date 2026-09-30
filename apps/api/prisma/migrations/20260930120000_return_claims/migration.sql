-- CreateEnum
CREATE TYPE "ClaimStatus" AS ENUM ('PENDENTE', 'CONFIRMADA', 'RECUSADA');

-- CreateTable
CREATE TABLE "ReturnClaim" (
    "id" TEXT NOT NULL,
    "withdrawalItemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "declaredCondition" "ReturnCondition" NOT NULL,
    "note" TEXT,
    "status" "ClaimStatus" NOT NULL DEFAULT 'PENDENTE',
    "requesterIpHash" TEXT,
    "reviewedById" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReturnClaim_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ReturnClaim_withdrawalItemId_idx" ON "ReturnClaim"("withdrawalItemId");
CREATE INDEX "ReturnClaim_status_idx" ON "ReturnClaim"("status");
CREATE INDEX "ReturnClaim_createdAt_idx" ON "ReturnClaim"("createdAt");

-- AddForeignKey
ALTER TABLE "ReturnClaim" ADD CONSTRAINT "ReturnClaim_withdrawalItemId_fkey" FOREIGN KEY ("withdrawalItemId") REFERENCES "WithdrawalItem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ReturnClaim" ADD CONSTRAINT "ReturnClaim_reviewedById_fkey" FOREIGN KEY ("reviewedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
