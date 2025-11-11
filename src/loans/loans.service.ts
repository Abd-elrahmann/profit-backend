import { Injectable, BadRequestException, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateLoanDto, UpdateLoanDto } from './dto/loan.dto';
import { JournalSourceType, LoanStatus, LoanType, Prisma } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';
import { JournalService } from '../journal/journal.service';
import * as fs from 'fs';
import * as path from 'path';
import { DateTime } from 'luxon';
import * as dotenv from 'dotenv';

dotenv.config();

@Injectable()
export class LoansService {
    constructor(
        private readonly prisma: PrismaService,
        private readonly journalService: JournalService,
    ) { }

    private async updateClientStatus(clientId: number) {
        const loans = await this.prisma.loan.findMany({
            where: { clientId, status: LoanStatus.ACTIVE },
            include: { repayments: true },
        });

        if (loans.length === 0) {
            await this.prisma.client.update({
                where: { id: clientId },
                data: { status: 'منتهي' as any },
            });
            return;
        }

        const allRepayments = loans.flatMap(l => l.repayments);
        const overdue = allRepayments.filter(
            r => r.status === 'OVERDUE' || (r.status !== 'PAID' && r.dueDate < new Date()),
        );
        const unpaid = allRepayments.filter(r => r.status !== 'PAID');

        let newStatus: any = 'نشط';

        if (overdue.length > 0) {
            newStatus = 'متعثر';
        } else if (unpaid.length === 0) {
            newStatus = 'منتهي';
        }

        await this.prisma.client.update({
            where: { id: clientId },
            data: { status: newStatus },
        });
    }

    // Create Loan
    async createLoan(currentUser, dto: CreateLoanDto) {
        const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
        if (!client) throw new NotFoundException('Client not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        const bankAccount = await this.prisma.bANK_accounts.findUnique({ where: { id: dto.bankAccountId } });
        if (!bankAccount) throw new NotFoundException('Bank account not found');
        if (bankAccount.limit <= 0) throw new BadRequestException('Bank account limit exceeded');

        const principal = new Decimal(dto.amount);
        const interestRate = new Decimal(dto.interestRate);
        const totalAmount = principal.mul(interestRate.div(100).add(1));
        const totalInterest = totalAmount.minus(principal);

        const paymentAmount = new Decimal(dto.paymentAmount);

        // Calculate full installments and remainder
        const fullMonths = totalAmount.div(paymentAmount).floor();
        const lastPayment = totalAmount.minus(paymentAmount.mul(fullMonths));
        let months = fullMonths.toNumber();
        if (lastPayment.gt(0)) months += 1;

        // Loan code
        const now = new Date();
        const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
        const clientIdStr = String(client.id).padStart(3, '0');
        const code = `LN-${datePart}-${clientIdStr}`;

        const loan = await this.prisma.loan.create({
            data: {
                code,
                clientId: dto.clientId,
                amount: Number(principal.toFixed(2)),
                interestRate: Number(interestRate.toFixed(2)),
                interestAmount: Number(totalInterest.toFixed(2)),
                totalAmount: Number(totalAmount.toFixed(2)),
                paymentAmount: Number(paymentAmount.toFixed(2)),
                durationMonths: months,
                type: dto.type,
                startDate: new Date(dto.startDate),
                status: LoanStatus.PENDING,
                repaymentDay: dto.repaymentDay,
                bankAccountId: dto.bankAccountId,
                partnerId: dto.partnerId,
            },
        });

        // Update bank account
        const account = await this.prisma.bANK_accounts.update({
            where: { id: dto.bankAccountId },
            data: { limit: { decrement: 1 } },
            select: { limit: true },
        });
        if (account.limit <= 0) {
            await this.prisma.bANK_accounts.update({
                where: { id: dto.bankAccountId },
                data: { status: 'Expired' },
            });
        }

        const repayments: Prisma.RepaymentCreateManyInput[] = [];
        const startDate = new Date(dto.startDate);

        let remainingPrincipal = principal;
        let remainingInterest = totalInterest;

        for (let i = 1; i <= months; i++) {
            const dueDate = new Date(startDate);
            if (dto.type === LoanType.DAILY) dueDate.setDate(startDate.getDate() + i);
            else if (dto.type === LoanType.WEEKLY) dueDate.setDate(startDate.getDate() + i * 7);
            else {
                dueDate.setMonth(startDate.getMonth() + i);
                if (dto.repaymentDay) dueDate.setDate(dto.repaymentDay);
            }

            let amount = paymentAmount;
            // Last installment takes the remainder
            if (i === months && lastPayment.gt(0)) amount = lastPayment;

            // Calculate principal and interest for this installment proportionally
            let principalAmount: Decimal;
            let interestAmount: Decimal;

            if (i === months && lastPayment.gt(0)) {
                // Last payment: remaining principal + interest
                principalAmount = remainingPrincipal;
                interestAmount = remainingInterest;
            } else {
                // Distribute payment proportionally
                const interestRatio = remainingInterest.div(remainingPrincipal.plus(remainingInterest));
                interestAmount = amount.mul(interestRatio).toDecimalPlaces(2);
                principalAmount = amount.minus(interestAmount).toDecimalPlaces(2);
            }

            remainingPrincipal = remainingPrincipal.minus(principalAmount);
            remainingInterest = remainingInterest.minus(interestAmount);

            repayments.push({
                count: i,
                loanId: loan.id,
                clientId: dto.clientId,
                dueDate,
                amount: Number(amount.toFixed(2)),
                remaining: Number(amount.toFixed(2)),
                principalAmount: Number(principalAmount.toFixed(2)),
                interestAmount: Number(interestAmount.toFixed(2)),
                status: 'PENDING',
            });
        }

        await this.prisma.repayment.createMany({ data: repayments });

        // Audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بإنشاء سلفة جديدة للعميل ${client.name} بمبلغ ${dto.amount}`,
            },
        });

        return { message: 'Loan created successfully', loan };
    }

    // Activate Loan
    async activateLoan(id: number, userId: number) {
        const loan = await this.prisma.loan.findUnique({ where: { id } });
        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.PENDING)
            throw new BadRequestException('Only pending loans can be activated');

        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });

        // Get Accounts
        const receivable = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOANS_RECEIVABLE' },
        });
        const bank = await this.prisma.account.findFirst({
            where: { accountBasicType: 'BANK' },
        });

        if (!receivable || !bank)
            throw new BadRequestException('Loan receivable and bank accounts must exist');

        // Create Journal Entry (using JournalService)
        const { journal } = await this.journalService.createJournal(
            {
                reference: `LN-${loan.id}`,
                description: `Loan disbursement for client ${loan.clientId}`,
                type: 'GENERAL',
                sourceType: JournalSourceType.LOAN,
                sourceId: loan.id,
                lines: [
                    {
                        accountId: receivable.id,
                        debit: loan.amount,
                        credit: 0,
                        description: 'Loan receivable',
                        clientId: loan.clientId,
                    },
                    {
                        accountId: bank.id,
                        debit: 0,
                        credit: loan.amount,
                        description: 'Bank disbursement',
                    },
                ],
            },
            userId,
        );

        // Immediately post the journal (so balances update)
        await this.journalService.postJournal(journal.id, userId);

        // Update loan status and link to journal
        await this.prisma.loan.update({
            where: { id },
            data: {
                status: LoanStatus.ACTIVE,
                disbursementJournalId: journal.id,
            },
        });

        await this.updateClientStatus(loan.clientId);

        // create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: userId || 0,
                screen: 'Loans',
                action: 'POST',
                description: `قام المستخدم ${user?.name} بتفعيل السلفة رقم ${loan.code} للعميل ${loan.clientId}`,
            },
        });

        return {
            message: '✅ Loan activated, journal created and posted successfully',
            loanId: id,
            journalId: journal.id,
        };
    }

    // Deactivate Loan and remove all related journals
    async deactivateLoan(currentUser, id: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: {
                repayments: true,
            },
        });

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.ACTIVE)
            throw new BadRequestException('Only active loans can be deactivated');

        return await this.prisma.$transaction(async (tx) => {
            // Collect all repayment IDs
            const repaymentIds = loan.repayments.map(r => r.id);

            // Find all repayment journals
            const repaymentJournalIds = (
                await tx.journalHeader.findMany({
                    where: {
                        sourceType: JournalSourceType.REPAYMENT,
                        sourceId: { in: repaymentIds.length > 0 ? repaymentIds : undefined },
                    },
                    select: { id: true },
                })
            ).map(j => j.id);

            // Collect loan journals (disbursement + settlement)
            const loanJournalIds = [loan.disbursementJournalId, loan.settlementJournalId].filter(Boolean) as number[];

            // Combine all journal IDs to handle
            const allJournalIds = [...loanJournalIds, ...repaymentJournalIds];

            if (allJournalIds.length > 0) {
                // Unpost all before deletion
                for (const journalId of allJournalIds) {
                    try {
                        await this.journalService.unpostJournal(currentUser, journalId);
                    } catch (e) {
                        console.warn(`⚠️ Skipped unposting journal ${journalId}:`, e.message);
                    }
                }

                await tx.journalLine.deleteMany({
                    where: { journalId: { in: allJournalIds } },
                });
                await tx.journalHeader.deleteMany({
                    where: { id: { in: allJournalIds } },
                });
            }

            await tx.loan.update({
                where: { id },
                data: {
                    status: LoanStatus.PENDING,
                    disbursementJournalId: null,
                    settlementJournalId: null,
                },
            });

            await this.updateClientStatus(loan.clientId);

            // create audit log
            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Loans',
                    action: 'POST',
                    description: `قام المستخدم ${user?.name} بإلغاء تفعيل السلفة رقم ${loan.code} للعميل ${loan.clientId}`,
                },
            });

            return {
                message: '✅ Loan deactivated, all related journals unposted and deleted successfully',
                loanId: id,
                deletedJournalsCount: allJournalIds.length,
            };
        });
    }

    // Get all loans
    async getAllLoans(page: number = 1, limit = 10, filters?: any) {
        const where: any = {};

        if (filters?.status) where.status = filters.status;
        if (filters?.code) where.code = { contains: filters.code, mode: 'insensitive' };
        if (filters?.clientId) where.clientId = filters.clientId;
        if (filters?.clientName)
            where.client = { name: { contains: filters.clientName, mode: 'insensitive' } };
        if (filters?.bankAccountName)
            where.bankAccount = { name: { contains: filters.bankAccountName, mode: 'insensitive' } };
        if (filters?.partnerName)
            where.partner = { name: { contains: filters.partnerName, mode: 'insensitive' } };

        const unformattedLoans = await this.prisma.loan.findMany({
            where,
            include: { client: true, bankAccount: true, partner: true },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { id: 'desc' },
        });

        const loans = unformattedLoans.map((loan) => ({
            ...loan,
            createdAt: loan.createdAt
                ? DateTime.fromJSDate(loan.createdAt)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null,
            startDate: loan.startDate
                ? DateTime.fromJSDate(loan.startDate)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd')
                : null,
            endDate: loan.endDate
                ? DateTime.fromJSDate(loan.endDate)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd')
                : null,
        }));

        const total = await this.prisma.loan.count({ where });
        return { total, page, limit, data: loans };
    }

    // Get single loan (with repayments)
    async getLoanById(id: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: { repayments: true, client: true, bankAccount: true, partner: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        const toSaudiTime = (date: Date | null | undefined) =>
            date
                ? DateTime.fromJSDate(date)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null;

        let totalRemainingPrincipal = 0;
        let totalRemainingInterest = 0;

        // Filter out fully paid repayments
        const unpaidRepayments = loan.repayments.filter(rep => rep.status !== 'PAID');

        const formattedRepayments = unpaidRepayments.map((repayment) => {
            // Round to 2 decimals
            const remainingPrincipal = Number((repayment.principalAmount - repayment.paidAmount).toFixed(2));
            const remainingInterest = Number(
                (repayment.amount - repayment.principalAmount - Math.max(repayment.paidAmount - repayment.principalAmount, 0)).toFixed(2)
            );

            totalRemainingPrincipal += remainingPrincipal;
            totalRemainingInterest += remainingInterest;

            return {
                ...repayment,
                dueDate: toSaudiTime(repayment.dueDate),
                paymentDate: toSaudiTime(repayment.paymentDate),
                newDueDate: toSaudiTime(repayment.newDueDate),
                createdAt: toSaudiTime(repayment.createdAt),
                remainingPrincipal,
                remainingInterest,
                // Make sure these are decimals as well
                amount: Number(repayment.amount.toFixed(2)),
                principalAmount: Number(repayment.principalAmount.toFixed(2)),
                interestAmount: Number(repayment.interestAmount.toFixed(2)),
                paidAmount: Number(repayment.paidAmount.toFixed(2)),
            };
        });

        // Round totals as well
        const totalDue = Number((totalRemainingPrincipal + totalRemainingInterest).toFixed(2));
        totalRemainingPrincipal = Number(totalRemainingPrincipal.toFixed(2));
        totalRemainingInterest = Number(totalRemainingInterest.toFixed(2));

        return {
            ...loan,
            repayments: formattedRepayments,
            totalRemainingPrincipal,
            totalRemainingInterest,
            totalDue,
            amount: Number(loan.amount.toFixed(2)),
            interestAmount: Number(loan.interestAmount.toFixed(2)),
            totalAmount: Number(loan.totalAmount.toFixed(2)),
            paymentAmount: Number(loan.paymentAmount.toFixed(2)),
            newAmount: loan.newAmount ? Number(loan.newAmount.toFixed(2)) : null,
            earlyPaymentDiscount: loan.earlyPaymentDiscount ? Number(loan.earlyPaymentDiscount.toFixed(2)) : null,
            earlyPaidAmount: loan.earlyPaidAmount ? Number(loan.earlyPaidAmount.toFixed(2)) : null,
        };
    }

    // Update Loan
    async updateLoan(currentUser, id: number, dto: UpdateLoanDto) {
        const loan = await this.prisma.loan.findUnique({ where: { id } });
        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.PENDING)
            throw new BadRequestException('Only pending loans can be updated');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        // Update loan basic fields first
        const updated = await this.prisma.loan.update({
            where: { id },
            data: dto,
        });

        // If financial fields changed, regenerate repayments
        if (dto.amount || dto.interestRate || dto.type || dto.repaymentDay) {
            // Delete existing repayments
            await this.prisma.repayment.deleteMany({ where: { loanId: id } });

            // Use Decimal for accurate calculations
            const principal = new Decimal(dto.amount || updated.amount);
            const interestRate = new Decimal(dto.interestRate || updated.interestRate);
            const totalAmount = principal.mul(interestRate.div(100).add(1)).toDecimalPlaces(2);
            const totalInterest = totalAmount.minus(principal).toDecimalPlaces(2);

            // Update loan financials
            await this.prisma.loan.update({
                where: { id },
                data: {
                    amount: Number(principal.toFixed(2)),
                    interestRate: Number(interestRate.toFixed(2)),
                    interestAmount: Number(totalInterest.toFixed(2)),
                    totalAmount: Number(totalAmount.toFixed(2)),
                },
            });

            // Determine number of installments
            const repaymentCount =
                updated.type === LoanType.DAILY
                    ? updated.durationMonths * 30
                    : updated.type === LoanType.WEEKLY
                        ? updated.durationMonths * 4
                        : updated.durationMonths;

            // Calculate installment amount
            const installmentAmount = totalAmount.div(repaymentCount).toDecimalPlaces(2);
            const startDate = new Date(updated.startDate);
            let remainingPrincipal = principal;
            let remainingInterest = totalInterest;

            const repayments: Prisma.RepaymentCreateManyInput[] = [];

            for (let i = 1; i <= repaymentCount; i++) {
                const dueDate = new Date(startDate);
                if (updated.type === LoanType.DAILY) dueDate.setDate(startDate.getDate() + i);
                else if (updated.type === LoanType.WEEKLY) dueDate.setDate(startDate.getDate() + i * 7);
                else {
                    dueDate.setMonth(startDate.getMonth() + i);
                    if (dto.repaymentDay) dueDate.setDate(dto.repaymentDay);
                }

                let principalAmount: Decimal;
                let interestAmount: Decimal;
                // Last installment takes remaining amounts
                if (i === repaymentCount) {
                    principalAmount = remainingPrincipal;
                    interestAmount = remainingInterest;
                } else {
                    const interestRatio = remainingInterest.div(remainingPrincipal.plus(remainingInterest));
                    interestAmount = installmentAmount.mul(interestRatio).toDecimalPlaces(2);
                    principalAmount = installmentAmount.minus(interestAmount).toDecimalPlaces(2);
                }

                remainingPrincipal = remainingPrincipal.minus(principalAmount).toDecimalPlaces(2);
                remainingInterest = remainingInterest.minus(interestAmount).toDecimalPlaces(2);

                repayments.push({
                    count: i,
                    loanId: updated.id,
                    clientId: dto.clientId || loan.clientId,
                    dueDate,
                    amount: Number(installmentAmount.toFixed(2)),
                    remaining: Number(installmentAmount.toFixed(2)),
                    principalAmount: Number(principalAmount.toFixed(2)),
                    interestAmount: Number(interestAmount.toFixed(2)),
                    status: 'PENDING',
                });
            }

            await this.prisma.repayment.createMany({ data: repayments });
        }

        // create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'UPDATE',
                description: `قام المستخدم ${user?.name} بتحديث السلفة رقم ${loan.code} للعميل ${loan.clientId}`,
            },
        });

        return { message: 'Loan updated successfully', updated };
    }

    // Delete Loan
    async deleteLoan(currentUser, id: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: { repayments: true },
        });

        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.PENDING)
            throw new BadRequestException('Only pending loans can be deleted');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        return await this.prisma.$transaction(async (tx) => {
            const repaymentIds = loan.repayments.map((r) => r.id);

            await tx.notification.deleteMany({
                where: {
                    OR: [
                        { loanId: id },
                        { repaymentId: { in: repaymentIds.length > 0 ? repaymentIds : undefined } },
                    ],
                },
            });

            await tx.repayment.deleteMany({ where: { loanId: id } });

            await tx.loan.delete({ where: { id } });

            // create audit log
            await this.prisma.auditLog.create({
                data: {
                    userId: currentUser,
                    screen: 'Loans',
                    action: 'DELETE',
                    description: `قام المستخدم ${user?.name} بحذف السلفة رقم ${loan.code} للعميل ${loan.clientId}`,
                },
            });

            return { message: 'Loan and related data deleted successfully' };
        });
    }

    async uploadDebtAcknowledgmentFile(currentUser: number, loanId: number, file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file uploaded');

        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { client: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        const client = loan.client;
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const ext = path.extname(file.originalname);
        const fileName = `إقرار الدين - ${loan.code}${ext}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);

        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;

        // 6. Update loan with file URL
        await this.prisma.loan.update({
            where: { id: loanId },
            data: { DEBT_ACKNOWLEDGMENT: publicUrl },
        });

        // 7. Create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل إقرار الدين للسلفة رقم ${loan.code} الخاص بالعميل ${client.name}`,
            },
        });

        // 8. Return response
        return { message: 'تم تحميل إقرار الدين بنجاح', path: publicUrl };
    }

    async uploadPromissoryNoteFile(currentUser: number, loanId: number, file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file uploaded');

        // Find the loan and related client
        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { client: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        const client = loan.client;
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        // Create upload directory
        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        // Build filename with loan code
        const ext = path.extname(file.originalname);
        const fileName = `سند لأمر - ${loan.code}${ext}`;
        const filePath = path.join(uploadDir, fileName);

        // Save file
        fs.writeFileSync(filePath, file.buffer);

        // Generate public URL
        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;

        // Update loan with file URL
        await this.prisma.loan.update({
            where: { id: loanId },
            data: { PROMISSORY_NOTE: publicUrl },
        });

        // Create audit log
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل سند لأمر للسلفة رقم ${loan.code} الخاص بالعميل ${client.name}`,
            },
        });

        return { message: 'تم تحميل سند لأمر بنجاح', path: publicUrl };
    }

    async uploadSettlementFile(currentUser: number, loanId: number, file: Express.Multer.File) {
        if (!file) throw new BadRequestException('No file uploaded');


        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { client: true },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        if (loan.status !== LoanStatus.COMPLETED) {
            throw new BadRequestException('Only completed loans can have settlement files uploaded');
        }

        const client = loan.client;
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId);
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

        const ext = path.extname(file.originalname);
        const fileName = `تسوية - ${loan.code}${ext}`;
        const filePath = path.join(uploadDir, fileName);

        fs.writeFileSync(filePath, file.buffer);

        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;

        await this.prisma.loan.update({
            where: { id: loanId },
            data: { SETTLEMENT: publicUrl },
        });

        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل ملف التسوية للقرض رقم ${loan.code} الخاص بالعميل ${client.name}`,
            },
        });

        return { message: 'تم تحميل ملف التسوية بنجاح', path: publicUrl };
    }
}