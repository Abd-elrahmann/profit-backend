-- CreateTable
CREATE TABLE "LoanCount" (
    "id" SERIAL NOT NULL,
    "loanId" INTEGER NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "LoanCount_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "LoanCount" ADD CONSTRAINT "LoanCount_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
