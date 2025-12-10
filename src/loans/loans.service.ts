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
import moment from "moment-hijri";
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

    private toHijri(date: Date) {
        return moment(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY')
    }

    // Create Loan
    async createLoan(currentUser, dto: CreateLoanDto) {
        const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
        if (!client) throw new NotFoundException('Client not found');

        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });

        if (dto.partnerId) {
            const partnerCheck = await this.prisma.partner.findUnique({
                where: { id: dto.partnerId },
                select: { joinDistribute: true },
            });

            if (partnerCheck?.joinDistribute === false) throw new NotFoundException('هذا المستثمر لا يمكن دخوله في التوزيع');
        }

        const bankAccount = await this.prisma.bANK_accounts.findUnique({ where: { id: dto.bankAccountId } });
        if (!bankAccount) throw new NotFoundException('Bank account not found');
        if (bankAccount.limit <= 0) throw new BadRequestException('انتهى الحد المسموح للحساب البنكي');

        const principal = new Decimal(dto.amount);
        let totalInterest: Decimal;
        let totalAmount: Decimal;
        let interestRate: Decimal | undefined;

        if (dto.TotalInterest != null) {
            totalInterest = new Decimal(dto.TotalInterest);
            totalAmount = principal.plus(totalInterest);
            interestRate = totalInterest.div(principal).mul(100);
        } else if (dto.InterestPercentage != null) {
            interestRate = new Decimal(dto.InterestPercentage);
            totalAmount = principal.mul(interestRate.div(100).add(1));
            totalInterest = totalAmount.minus(principal);
        } else {
            throw new BadRequestException('يجب ادخال مبلغ او نسبة الفائدة');
        }

        const paymentAmount = new Decimal(dto.paymentAmount);

        // Calculate full installments and remainder
        const fullMonths = totalAmount.div(paymentAmount).floor().toNumber();
        const lastPayment = totalAmount.minus(paymentAmount.mul(fullMonths));
        let months = fullMonths;
        const hasRemainder = lastPayment.gt(0);


        const bank = await this.prisma.account.findFirst({
            where: { accountBasicType: 'BANK' },
        });
        if (!bank) throw new NotFoundException('Bank account not found');
        if (principal.gt(bank.balance)) {
            throw new BadRequestException('السلفة أكبر من رصيد البنك المتاح');
        }

        // Validate Kafeel
        if (dto.kafeelId) {
            const kafeel = await this.prisma.kafeel.findUnique({
                where: { id: dto.kafeelId },
                include: { loans: true },
            });
            if (!kafeel) throw new NotFoundException('Kafeel not found');

            if (kafeel.clientId !== dto.clientId) {
                throw new BadRequestException('This Kafeel is not associated with the selected client.');
            }

            const hasActiveLoan = kafeel.loans.some(
                (l) => l.status === LoanStatus.PENDING || l.status === LoanStatus.ACTIVE
            );

            if (hasActiveLoan) {
                throw new BadRequestException(
                    'الكفيل لديه سلفة نشطة أو معلقة بالفعل مع هذا العميل'
                );
            }
        }
        // Loan code
        const now = new Date();
        const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
        const clientIdStr = String(client.id).padStart(3, '0');
        const code = `LN-${datePart}-${clientIdStr}`;

        // Create loan
        const loan = await this.prisma.loan.create({
            data: {
                code,
                clientId: dto.clientId,
                kafeelId: dto.kafeelId ?? null,
                amount: Number(principal.toFixed(2)),
                interestRate: Number(interestRate.toFixed(2)),
                interestAmount: Number(totalInterest.toFixed(2)),
                totalAmount: Number(totalAmount.toFixed(2)),
                paymentAmount: Number(paymentAmount.toFixed(2)),
                durationMonths: months,
                type: dto.type,
                startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
                status: LoanStatus.PENDING,
                repaymentDay: dto.repaymentDay,
                bankAccountId: dto.bankAccountId,
                partnerId: dto.partnerId,
            },
        });

        if (dto.partnerId) {
            const partner = await this.prisma.partner.findUnique({
                where: { id: dto.partnerId },
                select: { id: true, totalAmount: true, isActive: true, joinDistribute: true },
            });

            if (!partner) throw new NotFoundException('Partner not found');

            // Get all partners
            const allPartners = await this.prisma.partner.findMany({
                select: { id: true, totalAmount: true, isActive: true, joinDistribute: true },
            });

            if (partner.isActive) {
                // Distribute among active partners only
                const activePartners = allPartners.filter(p => p.isActive);
                const totalActiveCapital = activePartners.reduce((sum, p) => sum + p.totalAmount, 0);

                for (const p of activePartners) {
                    const percent = totalActiveCapital > 0 ? (p.totalAmount / totalActiveCapital) * 100 : 0;
                    await this.prisma.loanPartnerShare.create({
                        data: {
                            loanId: loan.id,
                            partnerId: p.id,
                            sharePercent: Number(percent.toFixed(2)),
                            isActive: true,
                        },
                    });
                }
            } else {
                // Distribute among inactive partners who joined
                const inactiveJoinPartners = allPartners.filter(p => !p.isActive && p.joinDistribute);
                const totalInactiveCapital = inactiveJoinPartners.reduce((sum, p) => sum + p.totalAmount, 0);
                for (const p of inactiveJoinPartners) {
                    const percent = totalInactiveCapital > 0 ? (p.totalAmount / totalInactiveCapital) * 100 : 0;
                    await this.prisma.loanPartnerShare.create({
                        data: {
                            loanId: loan.id,
                            partnerId: p.id,
                            sharePercent: Number(percent.toFixed(2)),
                            isActive: false,
                        },
                    });
                }
            }
        }

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
        const startDate = new Date(dto.startDate || new Date());

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
            if (i === months && lastPayment.gt(0)) {
                amount = paymentAmount.plus(lastPayment);
            }

            let principalAmount: Decimal;
            let interestAmount: Decimal;

            if (i === months && lastPayment.gt(0)) {
                principalAmount = remainingPrincipal;
                interestAmount = remainingInterest;
            } else {
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

        // Get loan with includes
        const loanWithIncludes = await this.prisma.loan.findUnique({
            where: { id: loan.id },
            include: {
                client: true,
                bankAccount: true,
                partner: true,
                kafeel: { select: { name: true, nationalId: true, birthDate: true } },
                LoanPartnerShare: { select: { partnerId: true, sharePercent: true } },
            },
        });

        return { message: 'تم انشاء السلفة بنجاح', loan: loanWithIncludes };
    }

    // Activate Loan
    async activateLoan(id: number, userId: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: { repayments: true }
        });
        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.PENDING)
            throw new BadRequestException('فقط السلف المعلقة يمكن تفعيلها');

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
                description: `صرف سلفة للعميل ${loan.clientId}`,
                type: 'GENERAL',
                sourceType: JournalSourceType.LOAN,
                sourceId: loan.id,
                lines: [
                    {
                        accountId: receivable.id,
                        debit: loan.amount,
                        credit: 0,
                        description: 'سلفة عميل',
                        clientId: loan.clientId,
                    },
                    {
                        accountId: bank.id,
                        debit: 0,
                        credit: loan.amount,
                        description: 'سلفة عميل',
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

        const activationDate = new Date();

        // 1) تحديث startDate
        await this.prisma.loan.update({
            where: { id },
            data: { startDate: activationDate },
        });

        // 2) إعادة حساب تواريخ الأقساط بناءً على النوع
        for (const repayment of loan.repayments) {
            let newDueDate: Date;

            if (loan.type === LoanType.DAILY) {
                newDueDate = new Date(Date.UTC(
                    activationDate.getUTCFullYear(),
                    activationDate.getUTCMonth(),
                    activationDate.getUTCDate() + repayment.count,
                    0, 0, 0, 0
                ));
            } else if (loan.type === LoanType.WEEKLY) {
                newDueDate = new Date(Date.UTC(
                    activationDate.getUTCFullYear(),
                    activationDate.getUTCMonth(),
                    activationDate.getUTCDate() + repayment.count * 7,
                    0, 0, 0, 0
                ));
            } else {
                // Monthly loan
                const month = activationDate.getUTCMonth() + repayment.count;
                const day = loan.repaymentDay ?? activationDate.getUTCDate();
                newDueDate = new Date(Date.UTC(
                    activationDate.getUTCFullYear(),
                    month,
                    day,
                    0, 0, 0, 0
                ));
            }

            // Update repayment
            await this.prisma.repayment.update({
                where: { id: repayment.id },
                data: { dueDate: newDueDate }
            });
        }

        await this.updateClientStatus(loan.clientId);

        if (loan.partnerId) {
            const partner = await this.prisma.partner.findUnique({ where: { id: loan.partnerId } });
            if (partner && !partner.isActive) {
                await this.prisma.partner.update({
                    where: { id: partner.id },
                    data: { isActive: true },
                });
            }
        }

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
            message: 'تم تفعيل السلفة بنجاح',
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
            throw new BadRequestException('فقط السلف النشطة يمكن إلغاء تفعيلها');

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

            if (loan.partnerId) {
                const loanPartnerShare = await tx.loanPartnerShare.findFirst({
                    where: { loanId: loan.id, partnerId: loan.partnerId },
                });

                if (loanPartnerShare && loanPartnerShare.isActive === false) {
                    await tx.partner.update({
                        where: { id: loan.partnerId },
                        data: { isActive: false },
                    });
                }
            }

            await tx.partnerShareAccrual.deleteMany({ where: { loanId: id } });

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
                message: 'تم إلغاء تفعيل السلفة بنجاح',
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
            include: {
                client: true,
                bankAccount: true,
                partner: true,
                kafeel: { select: { id: true, name: true } }
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { id: 'desc' },
        });

        const loans = unformattedLoans.map((loan) => {
            const createdAt = loan.createdAt ? new Date(loan.createdAt) : null;
            const startDate = loan.startDate ? new Date(loan.startDate) : null;
            const endDate = loan.endDate ? new Date(loan.endDate) : null;

            return {
                ...loan,
                createdAt: createdAt
                    ? DateTime.fromJSDate(createdAt).setZone('Asia/Riyadh').toFormat('yyyy-LL-dd HH:mm:ss')
                    : null,
                startDate: startDate
                    ? DateTime.fromJSDate(startDate).setZone('Asia/Riyadh').toFormat('yyyy-LL-dd')
                    : null,
                endDate: endDate
                    ? DateTime.fromJSDate(endDate).setZone('Asia/Riyadh').toFormat('yyyy-LL-dd')
                    : null,

                // Hijri Dates
                createdAtHijri: createdAt ? this.toHijri(createdAt) : null,
                startDateHijri: startDate ? this.toHijri(startDate) : null,
                endDateHijri: endDate ? this.toHijri(endDate) : null,
            };
        });

        const total = await this.prisma.loan.count({ where });
        return { total, page, limit, data: loans };
    }

    async getLoanById(id: number, page: number, limit: number = 10) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: {
                client: true,
                bankAccount: true,
                partner: true,
                kafeel: { select: { name: true, nationalId: true, birthDate: true } },
                LoanPartnerShare: { select: { partnerId: true, sharePercent: true } },
            },
        });
        if (!loan) throw new NotFoundException('Loan not found');

        // Count total repayments
        const totalRepayments = await this.prisma.repayment.count({
            where: { loanId: id },
        });

        // Fetch paginated repayments
        const Repayments = await this.prisma.repayment.findMany({
            where: { loanId: id },
            orderBy: { dueDate: 'asc' },
            skip: (page - 1) * limit,
            take: limit,
        });

        const toSaudiTime = (date: Date | null | undefined) =>
            date
                ? DateTime.fromJSDate(date)
                    .setZone('Asia/Riyadh')
                    .toFormat('yyyy-LL-dd HH:mm:ss')
                : null;

        const toDateOnly = (date: Date | null | undefined) =>
            date ? DateTime.fromJSDate(date).toFormat('yyyy-LL-dd') : null;

        const toSaudiHijri = (date: Date | null | undefined) =>
            date
                ? this.toHijri(DateTime.fromJSDate(date).setZone('Asia/Riyadh').toJSDate())
                : null;

        const getpartnername = async (partnerId: number) => {
            const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
            return {
                name: partner?.name ?? 'Unknown',
                nationalId: partner?.nationalId ?? 'N/A',
            };
        };

        const loanPartnerShareName = await Promise.all(
            loan.LoanPartnerShare.map(async (share) => {
                const partnerInfo = await getpartnername(share.partnerId);
                return {
                    ...share,
                    ...partnerInfo,
                };
            })
        );

        let totalRemainingPrincipal = 0;
        let totalRemainingInterest = 0;

        const formattedRepayments = Repayments.map((repayment) => {
            const remainingPrincipal = Number(
                Math.max(repayment.principalAmount - repayment.paidAmount, 0).toFixed(2)
            );

            const remainingInterest = Number(
                (
                    repayment.amount -
                    repayment.principalAmount -
                    Math.max(repayment.paidAmount - repayment.principalAmount, 0)
                ).toFixed(2)
            );

            totalRemainingPrincipal += remainingPrincipal;
            totalRemainingInterest += remainingInterest;

            return {
                ...repayment,
                dueDate: toSaudiTime(repayment.dueDate),
                paymentDate: toSaudiTime(repayment.paymentDate),
                newDueDate: toSaudiTime(repayment.newDueDate),
                createdAt: toSaudiTime(repayment.createdAt),
                dueDateHijri: toSaudiHijri(repayment.dueDate),
                paymentDateHijri: toSaudiHijri(repayment.paymentDate),
                newDueDateHijri: toSaudiHijri(repayment.newDueDate),
                createdAtHijri: toSaudiHijri(repayment.createdAt),
                remainingPrincipal,
                remainingInterest,
                amount: Number(repayment.amount.toFixed(2)),
                principalAmount: Number(repayment.principalAmount.toFixed(2)),
                interestAmount: Number(repayment.interestAmount.toFixed(2)),
                paidAmount: Number(repayment.paidAmount.toFixed(2)),
            };
        });

        const totalDue = Number((totalRemainingPrincipal + totalRemainingInterest).toFixed(2));
        totalRemainingPrincipal = Number(totalRemainingPrincipal.toFixed(2));
        totalRemainingInterest = Number(totalRemainingInterest.toFixed(2));

        return {
            ...loan,
            createdAtHijri: toSaudiHijri(loan.createdAt),
            startDateHijri: loan.startDate ? toSaudiHijri(loan.startDate) : null,
            endDateHijri: loan.endDate ? toSaudiHijri(loan.endDate) : null,

            pagination: {
                totalPages: Math.ceil(totalRepayments / limit),
                limit,
                page,
                totalRepayments: totalRepayments,
            },
            repayments: formattedRepayments,
            loanPartnerShare: loanPartnerShareName,
            totalRemainingPrincipal,
            totalRemainingInterest,
            totalDue,

            client: {
                ...loan.client,
                birthDate: toDateOnly(loan.client.birthDate),
            },
            kafeel: loan.kafeel
                ? {
                    ...loan.kafeel,
                    birthDate: toDateOnly(loan.kafeel.birthDate),
                }
                : null,
        };
    }

    // Update Loan
    async updateLoan(currentUser, id: number, dto: UpdateLoanDto) {
        const loan = await this.prisma.loan.findUnique({ where: { id } });
        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.PENDING)
            throw new BadRequestException('فقط السلف المعلقة يمكن تعديلها');

        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });

        const loanUpdateData: any = {};

        // Map fields that exist in the Prisma model
        if (dto.amount !== undefined) loanUpdateData.amount = dto.amount;
        if (dto.paymentAmount !== undefined) loanUpdateData.paymentAmount = dto.paymentAmount;
        if (dto.type !== undefined) loanUpdateData.type = dto.type;
        if (dto.startDate !== undefined) loanUpdateData.startDate = new Date(dto.startDate);
        if (dto.repaymentDay !== undefined) loanUpdateData.repaymentDay = dto.repaymentDay;
        if (dto.bankAccountId !== undefined) loanUpdateData.bankAccountId = dto.bankAccountId;
        if (dto.partnerId !== undefined) loanUpdateData.partnerId = dto.partnerId;
        if (dto.clientId !== undefined) loanUpdateData.clientId = dto.clientId;
        if (dto.kafeelId !== undefined) loanUpdateData.kafeelId = dto.kafeelId;
        if (dto.InterestPercentage !== undefined) {
            loanUpdateData.interestRate = dto.InterestPercentage;
        }

        if (dto.TotalInterest !== undefined) {
            loanUpdateData.interestAmount = dto.TotalInterest;
        }

        const updated = await this.prisma.loan.update({
            where: { id },
            data: loanUpdateData,
        });

        // Recalculate partner shares if partnerId changed
        if (dto.partnerId) {
            const partner = await this.prisma.partner.findUnique({
                where: { id: dto.partnerId },
                select: { id: true, totalAmount: true, isActive: true, joinDistribute: true },
            });

            if (!partner) throw new NotFoundException('Partner not found');

            await this.prisma.loanPartnerShare.deleteMany({ where: { loanId: loan.id } });

            const allPartners = await this.prisma.partner.findMany({
                select: { id: true, totalAmount: true, isActive: true, joinDistribute: true },
            });

            if (partner.isActive) {
                const activePartners = allPartners.filter(p => p.isActive);
                const totalActiveCapital = activePartners.reduce((sum, p) => sum + p.totalAmount, 0);

                for (const p of activePartners) {
                    const percent = totalActiveCapital > 0 ? (p.totalAmount / totalActiveCapital) * 100 : 0;
                    await this.prisma.loanPartnerShare.create({
                        data: {
                            loanId: loan.id,
                            partnerId: p.id,
                            sharePercent: Number(percent.toFixed(2)),
                            isActive: true,
                        },
                    });
                }
            } else {
                const inactiveJoinPartners = allPartners.filter(p => !p.isActive && p.joinDistribute);
                const totalInactiveCapital = inactiveJoinPartners.reduce((sum, p) => sum + p.totalAmount, 0);

                for (const p of inactiveJoinPartners) {
                    const percent = totalInactiveCapital > 0 ? (p.totalAmount / totalInactiveCapital) * 100 : 0;
                    await this.prisma.loanPartnerShare.create({
                        data: {
                            loanId: loan.id,
                            partnerId: p.id,
                            sharePercent: Number(percent.toFixed(2)),
                            isActive: false,
                        },
                    });
                }
            }
        }

        // If financial fields changed, regenerate repayments
        if (dto.amount || dto.InterestPercentage || dto.TotalInterest || dto.type || dto.repaymentDay || dto.startDate) {
            // Delete existing repayments
            await this.prisma.repayment.deleteMany({ where: { loanId: id } });

            // Use Decimal for accurate calculations
            const principal = new Decimal(dto.amount || updated.amount);
            let totalInterest: Decimal;
            let totalAmount: Decimal;
            let interestRate: Decimal;

            if (dto.TotalInterest != null) {
                totalInterest = new Decimal(dto.TotalInterest);
                totalAmount = principal.plus(totalInterest);
                interestRate = totalInterest.div(principal).mul(100);
            } else if (dto.InterestPercentage != null) {
                interestRate = new Decimal(dto.InterestPercentage);
                totalAmount = principal.mul(interestRate.div(100).add(1));
                totalInterest = totalAmount.minus(principal);
            } else if (updated.interestRate != null) {
                interestRate = new Decimal(updated.interestRate);
                totalAmount = principal.mul(interestRate.div(100).add(1));
                totalInterest = totalAmount.minus(principal);
            } else {
                throw new BadRequestException('يجب ادخال مبلغ او نسبة الفائدة');
            }

            // Update loan financials
            await this.prisma.loan.update({
                where: { id },
                data: {
                    kafeelId: Number(dto.kafeelId),
                    amount: Number(principal.toFixed(2)),
                    interestRate: Number(interestRate.toFixed(2)),
                    interestAmount: Number(totalInterest.toFixed(2)),
                    totalAmount: Number(totalAmount.toFixed(2)),
                    startDate: dto.startDate ? new Date(dto.startDate) : loan.startDate,
                },
            });

            // Payment amount
            const paymentAmount = new Decimal(dto.paymentAmount || updated.paymentAmount);

            // Calculate installments
            const fullMonths = totalAmount.div(paymentAmount).floor().toNumber();
            const lastPayment = totalAmount.minus(paymentAmount.mul(fullMonths));
            const months = fullMonths;
            const hasRemainder = lastPayment.gt(0);

            let remainingPrincipal = principal;
            let remainingInterest = totalInterest;

            const repayments: Prisma.RepaymentCreateManyInput[] = [];
            const startDate = new Date(dto.startDate || updated.startDate);

            for (let i = 1; i <= months; i++) {
                const dueDate = new Date(startDate);
                dueDate.setMonth(startDate.getMonth() + i);
                if (dto.repaymentDay) dueDate.setDate(dto.repaymentDay);

                let amount = paymentAmount;
                if (i === months && hasRemainder) {
                    amount = paymentAmount.plus(lastPayment);
                }

                let principalAmount: Decimal;
                let interestAmount: Decimal;

                if (i === months && hasRemainder) {
                    principalAmount = remainingPrincipal;
                    interestAmount = remainingInterest;
                } else {
                    const interestRatio = remainingInterest.div(remainingPrincipal.plus(remainingInterest));
                    interestAmount = amount.mul(interestRatio).toDecimalPlaces(2);
                    principalAmount = amount.minus(interestAmount).toDecimalPlaces(2);
                }

                remainingPrincipal = remainingPrincipal.minus(principalAmount);
                remainingInterest = remainingInterest.minus(interestAmount);

                repayments.push({
                    loanId: id,
                    count: i,
                    clientId: dto.clientId || updated.clientId,
                    dueDate,
                    amount: Number(amount.toFixed(2)),
                    remaining: Number(amount.toFixed(2)),
                    principalAmount: Number(principalAmount.toFixed(2)),
                    interestAmount: Number(interestAmount.toFixed(2)),
                    status: 'PENDING',
                });
            }

            await this.prisma.repayment.createMany({ data: repayments });
        }

        // If amount changed, clear existing contracts to force regeneration
        if (dto.amount && dto.amount !== loan.amount) {
            await this.prisma.loan.update({
                where: { id },
                data: {
                    DEBT_ACKNOWLEDGMENT: null,
                    PROMISSORY_NOTE: null,
                },
            });
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

        return { message: 'تم تعديل السلفة بنجاح', updated };
    }

    // Delete Loan
    async deleteLoan(currentUser, id: number) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: { repayments: true },
        });

        if (!loan) throw new NotFoundException('Loan not found');
        if (loan.status !== LoanStatus.PENDING)
            throw new BadRequestException('فقط السلف المعلقة يمكن حذفها');

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

            await tx.loanPartnerShare.deleteMany({ where: { loanId: id } });

            await tx.partnerShareAccrual.deleteMany({ where: { loanId: id } });

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

            return { message: 'تم حذف السلفة بنجاح' };
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

        // Generate unique debt acknowledgment number
        const debtAcknowledgmentNumber = `ACK-${loanId}-${Date.now()}`;

        // 6. Update loan with file URL and contract number
        await this.prisma.loan.update({
            where: { id: loanId },
            data: {
                DEBT_ACKNOWLEDGMENT: publicUrl,
                debtAcknowledgmentNumber: debtAcknowledgmentNumber
            },
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

        // Generate unique promissory note number
        const promissoryNoteNumber = `NOTE-${loanId}-${Date.now()}`;

        // Update loan with file URL and contract number
        await this.prisma.loan.update({
            where: { id: loanId },
            data: {
                PROMISSORY_NOTE: publicUrl,
                promissoryNoteNumber: promissoryNoteNumber
            },
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
            throw new BadRequestException('فقط السلف المكتملة يمكن تحميل ملف التسوية لها');
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