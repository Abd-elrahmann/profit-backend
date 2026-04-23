-- CreateTable
CREATE TABLE "ExternalInvestmentPartnerShare" (
    "id" SERIAL NOT NULL,
    "externalInvestmentId" INTEGER NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "sharePercent" DOUBLE PRECISION NOT NULL,
    "orgProfitPercent" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "ExternalInvestmentPartnerShare_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ExternalInvestmentPartnerShare_externalInvestmentId_partner_key" ON "ExternalInvestmentPartnerShare"("externalInvestmentId", "partnerId");

-- AddForeignKey
ALTER TABLE "ExternalInvestmentPartnerShare" ADD CONSTRAINT "ExternalInvestmentPartnerShare_externalInvestmentId_fkey" FOREIGN KEY ("externalInvestmentId") REFERENCES "ExternalInvestment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExternalInvestmentPartnerShare" ADD CONSTRAINT "ExternalInvestmentPartnerShare_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
