-- CreateTable
CREATE TABLE "RepaymentCount" (
    "id" SERIAL NOT NULL,
    "repaymentId" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "RepaymentCount_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerCount" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "PartnerCount_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RepaymentCount" ADD CONSTRAINT "RepaymentCount_repaymentId_fkey" FOREIGN KEY ("repaymentId") REFERENCES "Repayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerCount" ADD CONSTRAINT "PartnerCount_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
