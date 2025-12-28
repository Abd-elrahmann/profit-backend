-- CreateEnum
CREATE TYPE "ClientStatus" AS ENUM ('نشط', 'منتهي', 'متعثر');

-- CreateEnum
CREATE TYPE "LoanType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

-- CreateEnum
CREATE TYPE "LoanFundSource" AS ENUM ('GENERAL', 'NEW_CAPITAL');

-- CreateEnum
CREATE TYPE "LoanStatus" AS ENUM ('PENDING', 'ACTIVE', 'COMPLETED', 'DEFAULTED');

-- CreateEnum
CREATE TYPE "SmallLoanStatus" AS ENUM ('OPEN', 'PARTIALLY_PAID', 'PAID');

-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('LOAN_REMINDER', 'REPAYMENT_DUE', 'REPAYMENT_LATE', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'GENERAL');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PENDING', 'PENDING_REVIEW', 'PAID', 'PARTIAL_PAID', 'EARLY_PAID', 'COMPLETED', 'OVERDUE');

-- CreateEnum
CREATE TYPE "PartnerStatus" AS ENUM ('ACTIVE', 'WITHDRAWING', 'WITHDRAWN');

-- CreateEnum
CREATE TYPE "TransactionType" AS ENUM ('DEPOSIT', 'WITHDRAWAL', 'PROFIT_WITHDRAWAL', 'SAVING_WITHDRAWAL');

-- CreateEnum
CREATE TYPE "AccountStatus" AS ENUM ('Active', 'Expired');

-- CreateEnum
CREATE TYPE "AccountBasicType" AS ENUM ('BANK', 'CASH', 'EXPENSES', 'LOANS_RECEIVABLE', 'SMALL_LOANS_RECEIVABLE', 'PARTNER_PAYABLE', 'PARTNER_EQUITY', 'PARTNER_SAVING', 'PARTNER_NEW_CAPITAL', 'NEW_CAPITAL_BANK', 'LOAN_INCOME', 'COMPANY_SHARES', 'PARTNER_SHARES_EXPENSES', 'ZAKAT_EXPENSES', 'SAVINGS', 'LOSSES', 'OTHER');

-- CreateEnum
CREATE TYPE "AccountNature" AS ENUM ('DEBIT', 'CREDIT');

-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE');

-- CreateEnum
CREATE TYPE "JournalType" AS ENUM ('GENERAL', 'OPENING', 'CLOSING', 'ADJUSTMENT');

-- CreateEnum
CREATE TYPE "JournalSourceType" AS ENUM ('LOAN', 'REPAYMENT', 'PARTNER', 'PARTNER_TRANSACTION_WITHDRAWAL', 'PARTNER_TRANSACTION_DEPOSIT', 'PARTNER_PROFIT_WITHDRAWAL', 'PARTNER_SAVING_WITHDRAWAL', 'PERIOD_CLOSING', 'ZAKAT', 'SAVING', 'COMPANY_PROFIT_WITHDRAWAL', 'EXPENSES', 'LOSSES', 'PARTNER_WITHDRAWING', 'SMALL_LOAN', 'LOAN_CONVERSION', 'LOAN_INTEREST', 'OTHER');

-- CreateEnum
CREATE TYPE "JournalStatus" AS ENUM ('DRAFT', 'POSTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('MUDARABAH', 'PROMISSORY_NOTE', 'DEBT_ACKNOWLEDGMENT', 'WITHDRAWAL_RECEIPT', 'PAYMENT_VOUCHER', 'SETTLEMENT', 'PAYMENT_PROOF', 'REPAYMENT_DUE', 'REPAYMENT_LATE', 'PAYMENT_APPROVED', 'PAYMENT_REJECTED', 'GENERAL_NOTIFICATION');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "profileImage" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "roleId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "expenseAccountId" INTEGER,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ExpenseRecord" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "type" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "description" TEXT,
    "employeeId" INTEGER,
    "journalId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExpenseRecord_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RolePermission" (
    "id" SERIAL NOT NULL,
    "roleId" INTEGER NOT NULL,
    "module" TEXT NOT NULL,
    "canView" BOOLEAN NOT NULL DEFAULT false,
    "canAdd" BOOLEAN NOT NULL DEFAULT false,
    "canUpdate" BOOLEAN NOT NULL DEFAULT false,
    "canDelete" BOOLEAN NOT NULL DEFAULT false,
    "canPost" BOOLEAN NOT NULL DEFAULT false,
    "canExport" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "screen" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ResetPasswordToken" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ResetPasswordToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Client" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT NOT NULL,
    "telegramChatId" TEXT,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "address" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "salary" DOUBLE PRECISION NOT NULL,
    "obligations" DOUBLE PRECISION NOT NULL,
    "creationReason" TEXT NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "ClientStatus" NOT NULL DEFAULT 'نشط',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Client_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Kafeel" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "birthDate" TIMESTAMP(3) NOT NULL,
    "city" TEXT NOT NULL,
    "district" TEXT NOT NULL,
    "employer" TEXT NOT NULL,
    "salary" DOUBLE PRECISION NOT NULL,
    "obligations" DOUBLE PRECISION NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "kafeelIdImage" TEXT,
    "kafeelWorkCard" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Kafeel_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientDocument" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "clientIdImage" TEXT NOT NULL,
    "clientWorkCard" TEXT,
    "salaryReport" TEXT,
    "simaReport" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Loan" (
    "id" SERIAL NOT NULL,
    "code" TEXT NOT NULL,
    "clientId" INTEGER NOT NULL,
    "kafeelId" INTEGER,
    "amount" DOUBLE PRECISION NOT NULL,
    "interestRate" DOUBLE PRECISION NOT NULL,
    "interestAmount" DOUBLE PRECISION NOT NULL,
    "totalAmount" DOUBLE PRECISION NOT NULL,
    "paymentAmount" DOUBLE PRECISION NOT NULL,
    "durationMonths" INTEGER NOT NULL,
    "type" "LoanType" NOT NULL,
    "source" "LoanFundSource" NOT NULL,
    "status" "LoanStatus" NOT NULL DEFAULT 'PENDING',
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "repaymentDay" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "bankAccountId" INTEGER,
    "partnerId" INTEGER,
    "disbursementJournalId" INTEGER,
    "settlementJournalId" INTEGER,
    "DEBT_ACKNOWLEDGMENT" TEXT,
    "PROMISSORY_NOTE" TEXT,
    "SETTLEMENT" TEXT,
    "PAYMENT_PROOF" TEXT[],
    "debtAcknowledgmentNumber" TEXT,
    "promissoryNoteNumber" TEXT,
    "earlyPaidAmount" DOUBLE PRECISION DEFAULT 0,
    "earlyPaymentDiscount" DOUBLE PRECISION DEFAULT 0,
    "newAmount" INTEGER DEFAULT 0,

    CONSTRAINT "Loan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LoanPartnerShare" (
    "id" SERIAL NOT NULL,
    "loanId" INTEGER NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "sharePercent" DOUBLE PRECISION NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "LoanPartnerShare_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Repayment" (
    "id" SERIAL NOT NULL,
    "count" INTEGER NOT NULL,
    "loanId" INTEGER NOT NULL,
    "clientId" INTEGER NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "remaining" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "principalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "interestAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" "PaymentStatus" NOT NULL DEFAULT 'PENDING',
    "paymentDate" TIMESTAMP(3),
    "attachments" TEXT[],
    "PaymentProof" TEXT,
    "reviewStatus" TEXT,
    "notes" TEXT,
    "postponeApproved" BOOLEAN,
    "postponeReason" TEXT,
    "newDueDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Repayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SmallLoan" (
    "id" SERIAL NOT NULL,
    "Name" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining" DOUBLE PRECISION NOT NULL,
    "status" "SmallLoanStatus" NOT NULL DEFAULT 'OPEN',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "SmallLoan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" SERIAL NOT NULL,
    "title" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "clientId" INTEGER,
    "loanId" INTEGER,
    "repaymentId" INTEGER,
    "channel" TEXT,
    "sentAt" TIMESTAMP(3),
    "scheduledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Partner" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "nationalId" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "orgProfitPercent" DOUBLE PRECISION NOT NULL,
    "capitalAmount" DOUBLE PRECISION NOT NULL,
    "totalProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "contractSignedAt" TIMESTAMP(3),
    "mudarabahFileUrl" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "joinDistribute" BOOLEAN NOT NULL DEFAULT true,
    "WithdrawingStatus" "PartnerStatus" NOT NULL DEFAULT 'ACTIVE',
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "isNewPartner" BOOLEAN NOT NULL DEFAULT true,
    "accountPayableId" INTEGER NOT NULL,
    "accountEquityId" INTEGER NOT NULL,
    "accountSavingId" INTEGER NOT NULL,
    "accountNewCapitalId" INTEGER NOT NULL,
    "yearlyZakatRequired" DOUBLE PRECISION DEFAULT 0,
    "yearlyZakatPaid" DOUBLE PRECISION DEFAULT 0,
    "yearlyZakatBalance" DOUBLE PRECISION DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Partner_pkey" PRIMARY KEY ("id")
);

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

-- CreateTable
CREATE TABLE "PartnerWithdrawalSchedule" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "month" INTEGER NOT NULL,
    "year" INTEGER NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "paidAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "remaining" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "carryAmount" DOUBLE PRECISION,
    "carryFromId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "PartnerWithdrawalSchedule_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerWithdrawal" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "monthlyAmount" DOUBLE PRECISION NOT NULL,
    "totalCapital" DOUBLE PRECISION NOT NULL,
    "defaultShare" DOUBLE PRECISION NOT NULL,
    "remainingCapital" DOUBLE PRECISION NOT NULL,
    "savingAmount" DOUBLE PRECISION NOT NULL,
    "WITHDRAWAL_RECEIPT" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerTransaction" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "type" "TransactionType" NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reference" TEXT,
    "description" TEXT,
    "journalId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerTransaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerShareAccrual" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "loanId" INTEGER,
    "repaymentId" INTEGER,
    "rawShare" DOUBLE PRECISION NOT NULL,
    "companyCut" DOUBLE PRECISION NOT NULL,
    "partnerFinal" DOUBLE PRECISION NOT NULL,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,
    "isDistributed" BOOLEAN NOT NULL DEFAULT false,
    "periodId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerShareAccrual_pkey" PRIMARY KEY ("id")
);

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
    "month" INTEGER,
    "amount" DOUBLE PRECISION NOT NULL,
    "PAYMENT_VOUCHER" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ZakatPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "zakatWithdraw" (
    "id" SERIAL NOT NULL,
    "userId" INTEGER NOT NULL,
    "amount" INTEGER NOT NULL,
    "document" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "zakatWithdraw_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerSavingAccrual" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "accrualId" INTEGER NOT NULL,
    "savingAmount" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PartnerSavingAccrual_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BANK_accounts" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "owner" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "IBAN" TEXT NOT NULL,
    "limit" INTEGER NOT NULL,
    "status" "AccountStatus" NOT NULL DEFAULT 'Active',

    CONSTRAINT "BANK_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "parentId" INTEGER,
    "type" "AccountType" NOT NULL,
    "level" INTEGER NOT NULL DEFAULT 1,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "nature" "AccountNature" NOT NULL DEFAULT 'DEBIT',
    "accountBasicType" "AccountBasicType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PeriodHeader" (
    "id" SERIAL NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "openingJournalId" INTEGER,
    "closingJournalId" INTEGER,
    "isClosed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "PeriodHeader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PartnerPeriodProfit" (
    "id" SERIAL NOT NULL,
    "partnerId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "totalProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "PartnerPeriodProfit_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "accountsClosing" (
    "id" SERIAL NOT NULL,
    "accountId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "openingDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "accountsClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clientsClosing" (
    "id" SERIAL NOT NULL,
    "clientId" INTEGER NOT NULL,
    "periodId" INTEGER NOT NULL,
    "openingDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "openingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingDebit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingCredit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "closingBalance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "lastUpdated" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "clientsClosing_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalHeader" (
    "id" SERIAL NOT NULL,
    "reference" TEXT,
    "description" TEXT,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" "JournalType" NOT NULL DEFAULT 'GENERAL',
    "status" "JournalStatus" NOT NULL DEFAULT 'DRAFT',
    "sourceId" INTEGER,
    "sourceType" "JournalSourceType",
    "postedById" INTEGER,
    "periodId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JournalHeader_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JournalLine" (
    "id" SERIAL NOT NULL,
    "journalId" INTEGER NOT NULL,
    "accountId" INTEGER NOT NULL,
    "debit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "credit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "clientId" INTEGER,
    "description" TEXT,

    CONSTRAINT "JournalLine_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" SERIAL NOT NULL,
    "name" "TemplateType" NOT NULL,
    "description" TEXT,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_expenseAccountId_key" ON "User"("expenseAccountId");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "ResetPasswordToken_token_key" ON "ResetPasswordToken"("token");

-- CreateIndex
CREATE UNIQUE INDEX "LoanPartnerShare_loanId_partnerId_key" ON "LoanPartnerShare"("loanId", "partnerId");

-- CreateIndex
CREATE INDEX "SmallLoan_status_idx" ON "SmallLoan"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_accountPayableId_key" ON "Partner"("accountPayableId");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_accountEquityId_key" ON "Partner"("accountEquityId");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_accountSavingId_key" ON "Partner"("accountSavingId");

-- CreateIndex
CREATE UNIQUE INDEX "Partner_accountNewCapitalId_key" ON "Partner"("accountNewCapitalId");

-- CreateIndex
CREATE UNIQUE INDEX "PartnerTransaction_reference_key" ON "PartnerTransaction"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "ZakatAccrual_partnerId_year_month_key" ON "ZakatAccrual"("partnerId", "year", "month");

-- CreateIndex
CREATE UNIQUE INDEX "Account_code_key" ON "Account"("code");

-- CreateIndex
CREATE INDEX "Account_accountBasicType_code_idx" ON "Account"("accountBasicType", "code");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodHeader_openingJournalId_key" ON "PeriodHeader"("openingJournalId");

-- CreateIndex
CREATE UNIQUE INDEX "PeriodHeader_closingJournalId_key" ON "PeriodHeader"("closingJournalId");

-- CreateIndex
CREATE UNIQUE INDEX "JournalHeader_reference_key" ON "JournalHeader"("reference");

-- CreateIndex
CREATE UNIQUE INDEX "Template_name_key" ON "Template"("name");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_expenseAccountId_fkey" FOREIGN KEY ("expenseAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ExpenseRecord" ADD CONSTRAINT "ExpenseRecord_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalHeader"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ResetPasswordToken" ADD CONSTRAINT "ResetPasswordToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Kafeel" ADD CONSTRAINT "Kafeel_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientDocument" ADD CONSTRAINT "ClientDocument_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_kafeelId_fkey" FOREIGN KEY ("kafeelId") REFERENCES "Kafeel"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_bankAccountId_fkey" FOREIGN KEY ("bankAccountId") REFERENCES "BANK_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Loan" ADD CONSTRAINT "Loan_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPartnerShare" ADD CONSTRAINT "LoanPartnerShare_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanPartnerShare" ADD CONSTRAINT "LoanPartnerShare_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Repayment" ADD CONSTRAINT "Repayment_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_repaymentId_fkey" FOREIGN KEY ("repaymentId") REFERENCES "Repayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_accountPayableId_fkey" FOREIGN KEY ("accountPayableId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_accountEquityId_fkey" FOREIGN KEY ("accountEquityId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_accountSavingId_fkey" FOREIGN KEY ("accountSavingId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Partner" ADD CONSTRAINT "Partner_accountNewCapitalId_fkey" FOREIGN KEY ("accountNewCapitalId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerNewCapital" ADD CONSTRAINT "PartnerNewCapital_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanNewCapitalShare" ADD CONSTRAINT "LoanNewCapitalShare_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LoanNewCapitalShare" ADD CONSTRAINT "LoanNewCapitalShare_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerWithdrawalSchedule" ADD CONSTRAINT "PartnerWithdrawalSchedule_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerWithdrawal" ADD CONSTRAINT "PartnerWithdrawal_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerTransaction" ADD CONSTRAINT "PartnerTransaction_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerShareAccrual" ADD CONSTRAINT "PartnerShareAccrual_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PeriodHeader"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerShareAccrual" ADD CONSTRAINT "PartnerShareAccrual_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerShareAccrual" ADD CONSTRAINT "PartnerShareAccrual_loanId_fkey" FOREIGN KEY ("loanId") REFERENCES "Loan"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerShareAccrual" ADD CONSTRAINT "PartnerShareAccrual_repaymentId_fkey" FOREIGN KEY ("repaymentId") REFERENCES "Repayment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZakatAccrual" ADD CONSTRAINT "ZakatAccrual_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ZakatPayment" ADD CONSTRAINT "ZakatPayment_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "zakatWithdraw" ADD CONSTRAINT "zakatWithdraw_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSavingAccrual" ADD CONSTRAINT "PartnerSavingAccrual_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerSavingAccrual" ADD CONSTRAINT "PartnerSavingAccrual_accrualId_fkey" FOREIGN KEY ("accrualId") REFERENCES "PartnerPeriodProfit"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPeriodProfit" ADD CONSTRAINT "PartnerPeriodProfit_partnerId_fkey" FOREIGN KEY ("partnerId") REFERENCES "Partner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PartnerPeriodProfit" ADD CONSTRAINT "PartnerPeriodProfit_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PeriodHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountsClosing" ADD CONSTRAINT "accountsClosing_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "accountsClosing" ADD CONSTRAINT "accountsClosing_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PeriodHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientsClosing" ADD CONSTRAINT "clientsClosing_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PeriodHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "clientsClosing" ADD CONSTRAINT "clientsClosing_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalHeader" ADD CONSTRAINT "JournalHeader_postedById_fkey" FOREIGN KEY ("postedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalHeader" ADD CONSTRAINT "JournalHeader_periodId_fkey" FOREIGN KEY ("periodId") REFERENCES "PeriodHeader"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "JournalHeader"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JournalLine" ADD CONSTRAINT "JournalLine_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
