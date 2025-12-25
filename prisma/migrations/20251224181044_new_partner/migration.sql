-- CreateTable
CREATE TABLE "PartnerNewCapital" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "remaining" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerNewCapital_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanNewCapitalShare" (
    "id" SERIAL NOT NULL,
    "loanId" INTEGER NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "amountUsed" DOUBLE PRECISION NOT NULL,
    "percent" DOUBLE PRECISION NOT NULL,

    CONSTRAINT "LoanNewCapitalShare_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "PartnerNewCapital" ADD CONSTRAINT "PartnerNewCapital_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanNewCapitalShare" ADD CONSTRAINT "LoanNewCapitalShare_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanNewCapitalShare" ADD CONSTRAINT "LoanNewCapitalShare_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
