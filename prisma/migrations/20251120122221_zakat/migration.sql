-- AlterTable
ALTER TABLE "Partner" ADD COLUMN     "yearlyZakatBalance" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "yearlyZakatPaid" DOUBLE PRECISION DEFAULT 0,
ADD COLUMN     "yearlyZakatRequired" DOUBLE PRECISION DEFAULT 0;

-- CreateTable
CREATE TABLE "ZakatAccrual" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "periodId" INTEGER,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZakatAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ZakatPayment" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "periodId" INTEGER,
    "year" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZakatPayment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ZakatAccrual_partnerId_year_month_key" ON "ZakatAccrual"("partnerId", "year", "month");

-- AddForeignKey
ALTER TABLE "ZakatAccrual" ADD CONSTRAINT "ZakatAccrual_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZakatPayment" ADD CONSTRAINT "ZakatPayment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
