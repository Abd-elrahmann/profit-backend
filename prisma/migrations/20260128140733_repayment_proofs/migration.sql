-- CreateTable
CREATE TABLE "RepaymentPayment" (
    "id" SERIAL NOT NULL,
    "repaymentId" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION,
    "proofUrl" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepaymentPayment_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "RepaymentPayment" ADD CONSTRAINT "RepaymentPayment_repaymentId_fkey" FOREIGN KEY ("repaymentId") REFERENCES "Repayment"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
