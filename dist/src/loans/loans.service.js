"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.LoansService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../prisma/prisma.service");
const client_1 = require("@prisma/client");
const library_1 = require("@prisma/client/runtime/library");
const journal_service_1 = require("../journal/journal.service");
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const luxon_1 = require("luxon");
const dotenv = __importStar(require("dotenv"));
const moment_hijri_1 = __importDefault(require("moment-hijri"));
dotenv.config();
let LoansService = class LoansService {
    prisma;
    journalService;
    constructor(prisma, journalService) {
        this.prisma = prisma;
        this.journalService = journalService;
    }
    async updateClientStatus(clientId) {
        const loans = await this.prisma.loan.findMany({
            where: { clientId, status: client_1.LoanStatus.ACTIVE },
            include: { repayments: true },
        });
        if (loans.length === 0) {
            await this.prisma.client.update({
                where: { id: clientId },
                data: { status: 'منتهي' },
            });
            return;
        }
        const allRepayments = loans.flatMap(l => l.repayments);
        const overdue = allRepayments.filter(r => r.status === 'OVERDUE' || (r.status !== 'PAID' && r.dueDate < new Date()));
        const unpaid = allRepayments.filter(r => r.status !== 'PAID');
        let newStatus = 'نشط';
        if (overdue.length > 0) {
            newStatus = 'متعثر';
        }
        else if (unpaid.length === 0) {
            newStatus = 'منتهي';
        }
        await this.prisma.client.update({
            where: { id: clientId },
            data: { status: newStatus },
        });
    }
    toHijri(date) {
        return (0, moment_hijri_1.default)(date)
            .locale('ar-SA')
            .format('iDD iMMMM iYYYY');
    }
    async createLoan(currentUser, dto) {
        const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
        if (!client)
            throw new common_1.NotFoundException('Client not found');
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        if (dto.partnerId) {
            const partnerCheck = await this.prisma.partner.findUnique({
                where: { id: dto.partnerId },
                select: { joinDistribute: true },
            });
            if (partnerCheck?.joinDistribute === false)
                throw new common_1.NotFoundException('هذا المستثمر لا يمكن دخوله في التوزيع');
        }
        const bankAccount = await this.prisma.bANK_accounts.findUnique({ where: { id: dto.bankAccountId } });
        if (!bankAccount)
            throw new common_1.NotFoundException('Bank account not found');
        if (bankAccount.limit <= 0)
            throw new common_1.BadRequestException('انتهى الحد المسموح للحساب البنكي');
        const principal = new library_1.Decimal(dto.amount);
        let totalInterest;
        let totalAmount;
        let interestRate;
        if (dto.TotalInterest != null) {
            totalInterest = new library_1.Decimal(dto.TotalInterest);
            totalAmount = principal.plus(totalInterest);
            interestRate = totalInterest.div(principal).mul(100);
        }
        else if (dto.InterestPercentage != null) {
            interestRate = new library_1.Decimal(dto.InterestPercentage);
            totalAmount = principal.mul(interestRate.div(100).add(1));
            totalInterest = totalAmount.minus(principal);
        }
        else {
            throw new common_1.BadRequestException('يجب ادخال مبلغ او نسبة الفائدة');
        }
        const paymentAmount = new library_1.Decimal(dto.paymentAmount);
        const fullMonths = totalAmount.div(paymentAmount).floor();
        const lastPayment = totalAmount.minus(paymentAmount.mul(fullMonths));
        let months = fullMonths.toNumber();
        if (lastPayment.gt(0))
            months += 1;
        const bank = await this.prisma.account.findFirst({
            where: { accountBasicType: 'BANK' },
        });
        if (!bank)
            throw new common_1.NotFoundException('Bank account not found');
        if (principal.gt(bank.balance)) {
            throw new common_1.BadRequestException('السلفة أكبر من رصيد البنك المتاح');
        }
        if (dto.kafeelId) {
            const kafeel = await this.prisma.kafeel.findUnique({
                where: { id: dto.kafeelId },
                include: { loans: true },
            });
            if (!kafeel)
                throw new common_1.NotFoundException('Kafeel not found');
            if (kafeel.clientId !== dto.clientId) {
                throw new common_1.BadRequestException('This Kafeel is not associated with the selected client.');
            }
            const hasActiveLoan = kafeel.loans.some((l) => l.status === client_1.LoanStatus.PENDING || l.status === client_1.LoanStatus.ACTIVE);
            if (hasActiveLoan) {
                throw new common_1.BadRequestException('الكفيل لديه سلفة نشطة أو معلقة بالفعل مع هذا العميل');
            }
        }
        const now = new Date();
        const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
        const clientIdStr = String(client.id).padStart(3, '0');
        const code = `LN-${datePart}-${clientIdStr}`;
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
                status: client_1.LoanStatus.PENDING,
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
            if (!partner)
                throw new common_1.NotFoundException('Partner not found');
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
            }
            else {
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
        const repayments = [];
        const startDate = new Date(dto.startDate);
        let remainingPrincipal = principal;
        let remainingInterest = totalInterest;
        for (let i = 1; i <= months; i++) {
            const dueDate = new Date(startDate);
            if (dto.type === client_1.LoanType.DAILY)
                dueDate.setDate(startDate.getDate() + i);
            else if (dto.type === client_1.LoanType.WEEKLY)
                dueDate.setDate(startDate.getDate() + i * 7);
            else {
                dueDate.setMonth(startDate.getMonth() + i);
                if (dto.repaymentDay)
                    dueDate.setDate(dto.repaymentDay);
            }
            let amount = paymentAmount;
            if (i === months && lastPayment.gt(0))
                amount = lastPayment;
            let principalAmount;
            let interestAmount;
            if (i === months && lastPayment.gt(0)) {
                principalAmount = remainingPrincipal;
                interestAmount = remainingInterest;
            }
            else {
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
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بإنشاء سلفة جديدة للعميل ${client.name} بمبلغ ${dto.amount}`,
            },
        });
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
    async activateLoan(id, userId) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: { repayments: true }
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.status !== client_1.LoanStatus.PENDING)
            throw new common_1.BadRequestException('فقط السلف المعلقة يمكن تفعيلها');
        const user = await this.prisma.user.findUnique({
            where: { id: userId },
        });
        const receivable = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOANS_RECEIVABLE' },
        });
        const bank = await this.prisma.account.findFirst({
            where: { accountBasicType: 'BANK' },
        });
        if (!receivable || !bank)
            throw new common_1.BadRequestException('Loan receivable and bank accounts must exist');
        const { journal } = await this.journalService.createJournal({
            reference: `LN-${loan.id}`,
            description: `صرف سلفة للعميل ${loan.clientId}`,
            type: 'GENERAL',
            sourceType: client_1.JournalSourceType.LOAN,
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
        }, userId);
        await this.journalService.postJournal(journal.id, userId);
        await this.prisma.loan.update({
            where: { id },
            data: {
                status: client_1.LoanStatus.ACTIVE,
                disbursementJournalId: journal.id,
            },
        });
        const activationDate = new Date();
        await this.prisma.loan.update({
            where: { id },
            data: { startDate: activationDate },
        });
        for (const repayment of loan.repayments) {
            let newDueDate;
            if (loan.type === client_1.LoanType.DAILY) {
                newDueDate = new Date(Date.UTC(activationDate.getUTCFullYear(), activationDate.getUTCMonth(), activationDate.getUTCDate() + repayment.count, 0, 0, 0, 0));
            }
            else if (loan.type === client_1.LoanType.WEEKLY) {
                newDueDate = new Date(Date.UTC(activationDate.getUTCFullYear(), activationDate.getUTCMonth(), activationDate.getUTCDate() + repayment.count * 7, 0, 0, 0, 0));
            }
            else {
                const month = activationDate.getUTCMonth() + repayment.count;
                const day = loan.repaymentDay ?? activationDate.getUTCDate();
                newDueDate = new Date(Date.UTC(activationDate.getUTCFullYear(), month, day, 0, 0, 0, 0));
            }
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
    async deactivateLoan(currentUser, id) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: {
                repayments: true,
            },
        });
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.status !== client_1.LoanStatus.ACTIVE)
            throw new common_1.BadRequestException('فقط السلف النشطة يمكن إلغاء تفعيلها');
        return await this.prisma.$transaction(async (tx) => {
            const repaymentIds = loan.repayments.map(r => r.id);
            const repaymentJournalIds = (await tx.journalHeader.findMany({
                where: {
                    sourceType: client_1.JournalSourceType.REPAYMENT,
                    sourceId: { in: repaymentIds.length > 0 ? repaymentIds : undefined },
                },
                select: { id: true },
            })).map(j => j.id);
            const loanJournalIds = [loan.disbursementJournalId, loan.settlementJournalId].filter(Boolean);
            const allJournalIds = [...loanJournalIds, ...repaymentJournalIds];
            if (allJournalIds.length > 0) {
                for (const journalId of allJournalIds) {
                    try {
                        await this.journalService.unpostJournal(currentUser, journalId);
                    }
                    catch (e) {
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
                    status: client_1.LoanStatus.PENDING,
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
    async getAllLoans(page = 1, limit = 10, filters) {
        const where = {};
        if (filters?.status)
            where.status = filters.status;
        if (filters?.code)
            where.code = { contains: filters.code, mode: 'insensitive' };
        if (filters?.clientId)
            where.clientId = filters.clientId;
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
                    ? luxon_1.DateTime.fromJSDate(createdAt).setZone('Asia/Riyadh').toFormat('yyyy-LL-dd HH:mm:ss')
                    : null,
                startDate: startDate
                    ? luxon_1.DateTime.fromJSDate(startDate).setZone('Asia/Riyadh').toFormat('yyyy-LL-dd')
                    : null,
                endDate: endDate
                    ? luxon_1.DateTime.fromJSDate(endDate).setZone('Asia/Riyadh').toFormat('yyyy-LL-dd')
                    : null,
                createdAtHijri: createdAt ? this.toHijri(createdAt) : null,
                startDateHijri: startDate ? this.toHijri(startDate) : null,
                endDateHijri: endDate ? this.toHijri(endDate) : null,
            };
        });
        const total = await this.prisma.loan.count({ where });
        return { total, page, limit, data: loans };
    }
    async getLoanById(id, page, limit = 10) {
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
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        const totalRepayments = await this.prisma.repayment.count({
            where: { loanId: id },
        });
        const Repayments = await this.prisma.repayment.findMany({
            where: { loanId: id },
            orderBy: { dueDate: 'asc' },
            skip: (page - 1) * limit,
            take: limit,
        });
        const toSaudiTime = (date) => date
            ? luxon_1.DateTime.fromJSDate(date)
                .setZone('Asia/Riyadh')
                .toFormat('yyyy-LL-dd HH:mm:ss')
            : null;
        const toDateOnly = (date) => date ? luxon_1.DateTime.fromJSDate(date).toFormat('yyyy-LL-dd') : null;
        const toSaudiHijri = (date) => date
            ? this.toHijri(luxon_1.DateTime.fromJSDate(date).setZone('Asia/Riyadh').toJSDate())
            : null;
        const getpartnername = async (partnerId) => {
            const partner = await this.prisma.partner.findUnique({ where: { id: partnerId } });
            return {
                name: partner?.name ?? 'Unknown',
                nationalId: partner?.nationalId ?? 'N/A',
            };
        };
        const loanPartnerShareName = await Promise.all(loan.LoanPartnerShare.map(async (share) => {
            const partnerInfo = await getpartnername(share.partnerId);
            return {
                ...share,
                ...partnerInfo,
            };
        }));
        let totalRemainingPrincipal = 0;
        let totalRemainingInterest = 0;
        const formattedRepayments = Repayments.map((repayment) => {
            const remainingPrincipal = Number(Math.max(repayment.principalAmount - repayment.paidAmount, 0).toFixed(2));
            const remainingInterest = Number((repayment.amount -
                repayment.principalAmount -
                Math.max(repayment.paidAmount - repayment.principalAmount, 0)).toFixed(2));
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
    async updateLoan(currentUser, id, dto) {
        const loan = await this.prisma.loan.findUnique({ where: { id } });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.status !== client_1.LoanStatus.PENDING)
            throw new common_1.BadRequestException('فقط السلف المعلقة يمكن تعديلها');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const updated = await this.prisma.loan.update({
            where: { id },
            data: dto,
        });
        if (dto.partnerId) {
            const partner = await this.prisma.partner.findUnique({ where: { id: dto.partnerId } });
            if (!partner)
                throw new common_1.NotFoundException('Partner not found');
            await this.prisma.loanPartnerShare.deleteMany({ where: { loanId: loan.id } });
            if (partner.isActive === false) {
                await this.prisma.loanPartnerShare.upsert({
                    where: { loanId_partnerId: { loanId: loan.id, partnerId: partner.id } },
                    update: { sharePercent: 100, isActive: false },
                    create: { loanId: loan.id, partnerId: partner.id, sharePercent: 100, isActive: false },
                });
            }
            else {
                const activePartners = await this.prisma.partner.findMany({ where: { isActive: true } });
                const totalCapital = activePartners.reduce((sum, p) => sum + Number(p.capitalAmount), 0);
                for (const p of activePartners) {
                    const percent = (Number(p.capitalAmount) / totalCapital) * 100;
                    await this.prisma.loanPartnerShare.upsert({
                        where: { loanId_partnerId: { loanId: loan.id, partnerId: p.id } },
                        update: { sharePercent: percent, isActive: true },
                        create: { loanId: loan.id, partnerId: p.id, sharePercent: percent, isActive: true },
                    });
                }
            }
        }
        if (dto.amount || dto.InterestPercentage || dto.TotalInterest || dto.type || dto.repaymentDay || dto.startDate) {
            await this.prisma.repayment.deleteMany({ where: { loanId: id } });
            const principal = new library_1.Decimal(dto.amount || updated.amount);
            let totalInterest;
            let totalAmount;
            let interestRate;
            if (dto.TotalInterest != null) {
                totalInterest = new library_1.Decimal(dto.TotalInterest);
                totalAmount = principal.plus(totalInterest);
                interestRate = totalInterest.div(principal).mul(100);
            }
            else if (dto.InterestPercentage != null) {
                interestRate = new library_1.Decimal(dto.InterestPercentage);
                totalAmount = principal.mul(interestRate.div(100).add(1));
                totalInterest = totalAmount.minus(principal);
            }
            else if (updated.interestRate != null) {
                interestRate = new library_1.Decimal(updated.interestRate);
                totalAmount = principal.mul(interestRate.div(100).add(1));
                totalInterest = totalAmount.minus(principal);
            }
            else {
                throw new common_1.BadRequestException('يجب ادخال مبلغ او نسبة الفائدة');
            }
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
            const repaymentCount = updated.type === client_1.LoanType.DAILY
                ? updated.durationMonths * 30
                : updated.type === client_1.LoanType.WEEKLY
                    ? updated.durationMonths * 4
                    : updated.durationMonths;
            const installmentAmount = totalAmount.div(repaymentCount).toDecimalPlaces(2);
            const startDate = new Date(updated.startDate);
            let remainingPrincipal = principal;
            let remainingInterest = totalInterest;
            const repayments = [];
            for (let i = 1; i <= repaymentCount; i++) {
                const dueDate = new Date(startDate);
                if (updated.type === client_1.LoanType.DAILY)
                    dueDate.setDate(startDate.getDate() + i);
                else if (updated.type === client_1.LoanType.WEEKLY)
                    dueDate.setDate(startDate.getDate() + i * 7);
                else {
                    dueDate.setMonth(startDate.getMonth() + i);
                    if (dto.repaymentDay)
                        dueDate.setDate(dto.repaymentDay);
                }
                let principalAmount;
                let interestAmount;
                if (i === repaymentCount) {
                    principalAmount = remainingPrincipal;
                    interestAmount = remainingInterest;
                }
                else {
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
        if (dto.amount && dto.amount !== loan.amount) {
            await this.prisma.loan.update({
                where: { id },
                data: {
                    DEBT_ACKNOWLEDGMENT: null,
                    PROMISSORY_NOTE: null,
                },
            });
        }
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
    async deleteLoan(currentUser, id) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: { repayments: true },
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.status !== client_1.LoanStatus.PENDING)
            throw new common_1.BadRequestException('فقط السلف المعلقة يمكن حذفها');
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
    async uploadDebtAcknowledgmentFile(currentUser, loanId, file) {
        if (!file)
            throw new common_1.BadRequestException('No file uploaded');
        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { client: true },
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        const client = loan.client;
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId);
        if (!fs.existsSync(uploadDir))
            fs.mkdirSync(uploadDir, { recursive: true });
        const ext = path.extname(file.originalname);
        const fileName = `إقرار الدين - ${loan.code}${ext}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);
        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;
        const debtAcknowledgmentNumber = `ACK-${loanId}-${Date.now()}`;
        await this.prisma.loan.update({
            where: { id: loanId },
            data: {
                DEBT_ACKNOWLEDGMENT: publicUrl,
                debtAcknowledgmentNumber: debtAcknowledgmentNumber
            },
        });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'CREATE',
                description: `قام المستخدم ${user?.name} بتحميل إقرار الدين للسلفة رقم ${loan.code} الخاص بالعميل ${client.name}`,
            },
        });
        return { message: 'تم تحميل إقرار الدين بنجاح', path: publicUrl };
    }
    async uploadPromissoryNoteFile(currentUser, loanId, file) {
        if (!file)
            throw new common_1.BadRequestException('No file uploaded');
        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { client: true },
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        const client = loan.client;
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId);
        if (!fs.existsSync(uploadDir))
            fs.mkdirSync(uploadDir, { recursive: true });
        const ext = path.extname(file.originalname);
        const fileName = `سند لأمر - ${loan.code}${ext}`;
        const filePath = path.join(uploadDir, fileName);
        fs.writeFileSync(filePath, file.buffer);
        const relPath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
        const publicUrl = `${process.env.URL}${encodeURI(relPath)}`;
        const promissoryNoteNumber = `NOTE-${loanId}-${Date.now()}`;
        await this.prisma.loan.update({
            where: { id: loanId },
            data: {
                PROMISSORY_NOTE: publicUrl,
                promissoryNoteNumber: promissoryNoteNumber
            },
        });
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
    async uploadSettlementFile(currentUser, loanId, file) {
        if (!file)
            throw new common_1.BadRequestException('No file uploaded');
        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { client: true },
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.status !== client_1.LoanStatus.COMPLETED) {
            throw new common_1.BadRequestException('فقط السلف المكتملة يمكن تحميل ملف التسوية لها');
        }
        const client = loan.client;
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        const uploadDir = path.join(process.cwd(), 'uploads', 'clients', client.nationalId);
        if (!fs.existsSync(uploadDir))
            fs.mkdirSync(uploadDir, { recursive: true });
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
};
exports.LoansService = LoansService;
exports.LoansService = LoansService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        journal_service_1.JournalService])
], LoansService);
//# sourceMappingURL=loans.service.js.map