-- CreateTable
CREATE TABLE "PartnerLoss" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerLoss_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "PartnerLoss_partnerId_idx" ON "PartnerLoss"("partnerId");

-- CreateIndex
CREATE INDEX "PartnerLoss_createdAt_idx" ON "PartnerLoss"("createdAt");

-- AddForeignKey
ALTER TABLE "PartnerLoss" ADD CONSTRAINT "PartnerLoss_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
