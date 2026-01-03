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
            where: {
                clientId,
                status: client_1.LoanStatus.ACTIVE,
            },
            include: {
                repayments: true,
            },
        });
        if (loans.length === 0) {
            await this.prisma.client.update({
                where: { id: clientId },
                data: { status: 'منتهي' },
            });
            return;
        }
        const allRepayments = loans.flatMap(l => l.repayments);
        const now = new Date();
        const hasOverdue = allRepayments.some(r => r.status === 'OVERDUE' ||
            (r.status === 'PENDING' && r.dueDate < now));
        const allPaid = allRepayments.every(r => r.status === 'PAID' || r.status === 'EARLY_PAID');
        let newStatus = 'نشط';
        if (hasOverdue) {
            newStatus = 'متعثر';
        }
        else if (allPaid) {
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
    async createPartnerAccrualsOnActivation(loanId) {
        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: {
                LoanPartnerShare: true,
                LoanNewCapitalShare: true,
                partner: true
            }
        });
        if (!loan)
            return;
        let partnerShares = [];
        if (loan.source === client_1.LoanFundSource.GENERAL) {
            partnerShares = await this.prisma.loanPartnerShare.findMany({
                where: { loanId: loan.id, isActive: true },
                include: { partner: { select: { orgProfitPercent: true } } },
            });
        }
        else if (loan.source === client_1.LoanFundSource.NEW_CAPITAL) {
            partnerShares = await this.prisma.loanNewCapitalShare.findMany({
                where: { loanId: loan.id },
                include: { partner: { select: { orgProfitPercent: true } } },
            });
        }
        const currentPeriod = await this.prisma.periodHeader.findFirst({
            where: { endDate: null },
            orderBy: { startDate: 'desc' },
        });
        if (!currentPeriod) {
            throw new common_1.BadRequestException('No open period found. Please create a period first.');
        }
        const periodId = currentPeriod.id;
        for (const share of partnerShares) {
            const sharePercent = loan.source === client_1.LoanFundSource.GENERAL
                ? Number(share.sharePercent || 0)
                : Number(share.percent || 0);
            const orgCutPercent = Number(share.partner.orgProfitPercent || 0);
            const rawShare = loan.interestAmount * (sharePercent / 100);
            const companyCut = Number((rawShare * orgCutPercent / 100).toFixed(2));
            const partnerFinal = Number((rawShare - companyCut).toFixed(2));
            if (rawShare === 0 && companyCut === 0)
                continue;
            await this.prisma.partnerShareAccrual.create({
                data: {
                    periodId,
                    partnerId: share.partnerId,
                    loanId: loan.id,
                    rawShare,
                    companyCut,
                    partnerFinal,
                },
            });
        }
    }
    async handleNewCapitalOnActivation(tx, loan, currentUser) {
        const round2 = (n) => Math.round(n * 100) / 100;
        let shares = [];
        if (loan.source === client_1.LoanFundSource.NEW_CAPITAL) {
            shares = await tx.loanNewCapitalShare.findMany({
                where: { loanId: loan.id },
            });
        }
        else if (loan.source === client_1.LoanFundSource.GENERAL) {
            shares = await tx.loanPartnerShare.findMany({
                where: { loanId: loan.id },
            });
        }
        const lines = [];
        for (const s of shares) {
            const partner = await tx.partner.findUniqueOrThrow({
                where: { id: s.partnerId },
            });
            const profit = await tx.partnerShareAccrual.findFirstOrThrow({
                where: { partnerId: s.partnerId, loanId: s.loanId, isClosed: false },
            });
            await tx.partner.update({
                where: { id: s.partnerId },
                data: {
                    upcomingProfit: {
                        increment: profit.partnerFinal,
                    },
                },
            });
            if (loan.source !== client_1.LoanFundSource.NEW_CAPITAL)
                continue;
            const used = round2(Number(s.amountUsed || 0));
            if (used <= 0)
                continue;
            await tx.partner.update({
                where: { id: s.partnerId },
                data: {
                    isNewPartner: false,
                    capitalAmount: {
                        increment: used,
                    },
                    totalAmount: {
                        increment: used,
                    },
                }
            }),
                lines.push({
                    accountId: partner.accountNewCapitalId,
                    debit: used,
                    credit: 0,
                    description: `تحويل رأس مال شريك إلى عام ${loan.id}`,
                });
            lines.push({
                accountId: partner.accountEquityId,
                debit: 0,
                credit: used,
                description: `إثبات رأس مال الشريك`,
            });
        }
        if (loan.source !== client_1.LoanFundSource.NEW_CAPITAL || lines.length === 0)
            return;
        const journal = await this.journalService.createJournal({
            reference: `LOAN-ACT-${loan.id}`,
            description: `تحويل رأس مال الشركاء إلى العام`,
            type: 'GENERAL',
            sourceType: client_1.JournalSourceType.LOAN,
            sourceId: loan.id,
            lines,
        }, currentUser);
        await this.journalService.postJournal(journal.journal.id, currentUser);
    }
    async handleNewCapitalOnDeactivation(tx, loanId) {
        const round2 = (n) => Math.round(n * 100) / 100;
        const loan = await tx.loan.findUnique({
            where: { id: loanId },
            include: {
                LoanNewCapitalShare: true,
                LoanPartnerShare: true,
            },
        });
        if (!loan)
            return;
        let shares = [];
        if (loan.source === client_1.LoanFundSource.NEW_CAPITAL) {
            shares = loan.LoanNewCapitalShare;
        }
        else if (loan.source === client_1.LoanFundSource.GENERAL) {
            shares = loan.LoanPartnerShare.filter(p => p.isActive);
        }
        for (const s of shares) {
            const profit = await tx.partnerShareAccrual.findFirst({
                where: {
                    partnerId: s.partnerId,
                    loanId: loanId,
                    isClosed: false,
                },
                include: { partner: true }
            });
            if (!profit)
                continue;
            await tx.partner.update({
                where: { id: s.partnerId },
                data: {
                    upcomingProfit: {
                        decrement: profit.partnerFinal,
                    },
                },
            });
            if (loan.source !== client_1.LoanFundSource.NEW_CAPITAL)
                continue;
            const used = round2(Number(s.amountUsed || 0));
            if (used <= 0)
                continue;
            const capitalAmount = profit?.partner.capitalAmount || 0;
            const check = capitalAmount <= used;
            await tx.partner.update({
                where: { id: s.partnerId },
                data: {
                    capitalAmount: {
                        decrement: used,
                    },
                    totalAmount: {
                        decrement: used,
                    },
                    isNewPartner: check,
                },
            });
        }
    }
    async createLoan(currentUser, dto) {
        const client = await this.prisma.client.findUnique({ where: { id: dto.clientId } });
        if (!client)
            throw new common_1.NotFoundException('Client not found');
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        let fundSource = dto.source;
        if (fundSource === client_1.LoanFundSource.NEW_CAPITAL) {
            if (!dto.partnerId) {
                throw new common_1.BadRequestException('يجب اختيار مستثمر عند استخدام رأس المال الجديد');
            }
            const partnerNewCapital = await this.prisma.partnerNewCapital.findFirst({
                where: {
                    partnerId: dto.partnerId,
                    remaining: { gt: 0 },
                },
            });
            if (!partnerNewCapital) {
                throw new common_1.BadRequestException('هذا المستثمر لا يملك رأس مال جديد متاح');
            }
        }
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
            totalInterest = new library_1.Decimal(0);
            interestRate = new library_1.Decimal(0);
            totalAmount = principal;
        }
        const paymentAmount = new library_1.Decimal(dto.paymentAmount);
        const fullMonths = totalAmount.div(paymentAmount).floor().toNumber();
        const lastPayment = totalAmount.minus(paymentAmount.mul(fullMonths));
        let months = fullMonths;
        const hasRemainder = lastPayment.gt(0);
        if (fundSource === client_1.LoanFundSource.GENERAL) {
            const bank = await this.prisma.account.findFirst({
                where: { accountBasicType: 'BANK' },
            });
            if (!bank)
                throw new common_1.NotFoundException('Bank account not found');
            if (principal.gt(new library_1.Decimal(bank.balance))) {
                throw new common_1.BadRequestException('السلفة أكبر من رصيد البنك المتاح');
            }
        }
        let newCapitalPartners = [];
        let totalNewCapital = new library_1.Decimal(0);
        if (fundSource === client_1.LoanFundSource.NEW_CAPITAL) {
            newCapitalPartners = await this.prisma.partnerNewCapital.findMany({
                where: { remaining: { gt: 0 } },
                include: { Partner: true },
            });
            if (newCapitalPartners.length === 0) {
                throw new common_1.BadRequestException('لا يوجد رأس مال جديد متاح');
            }
            totalNewCapital = newCapitalPartners.reduce((sum, p) => sum.plus(p.remaining), new library_1.Decimal(0));
            if (totalNewCapital.lt(principal)) {
                throw new common_1.BadRequestException(`رصيد رأس المال الجديد غير كافٍ.المتاح: ${totalNewCapital.toFixed(2)}`);
            }
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
        }
        const now = new Date();
        const datePart = now.toISOString().slice(0, 10).replace(/-/g, '');
        const clientIdStr = String(client.id).padStart(3, '0');
        const code = `LN - ${datePart} - ${clientIdStr}`;
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
                source: fundSource,
                startDate: dto.startDate ? new Date(dto.startDate) : new Date(),
                createdAt: dto.startDate ? new Date(dto.startDate) : new Date(),
                promissionaryDate: dto.promissionaryDate ? new Date(dto.promissionaryDate) : new Date(),
                status: client_1.LoanStatus.PENDING,
                repaymentDay: dto.repaymentDay ? new Date(dto.repaymentDay) : new Date(),
                bankAccountId: dto.bankAccountId,
                partnerId: dto.partnerId,
                issuanceCity: dto.issuanceCity,
                paymentCity: dto.paymentCity,
            },
        });
        if (dto.partnerId && fundSource === client_1.LoanFundSource.GENERAL) {
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
        }
        if (fundSource === client_1.LoanFundSource.NEW_CAPITAL) {
            const newCapitalPartners = await this.prisma.partnerNewCapital.findMany({
                where: {
                    remaining: { gt: 0 },
                },
            });
            const totalNewCapital = newCapitalPartners.reduce((sum, p) => sum.plus(p.remaining), new library_1.Decimal(0));
            for (const p of newCapitalPartners) {
                const shareRatio = new library_1.Decimal(p.remaining).div(totalNewCapital);
                const usedAmount = Math.round(principal.mul(shareRatio).toNumber() * 100) / 100;
                await this.prisma.loanNewCapitalShare.create({
                    data: {
                        loanId: loan.id,
                        partnerId: p.partnerId,
                        amountUsed: usedAmount,
                        percent: Number(shareRatio.mul(100).toDecimalPlaces(2)),
                    },
                });
                await this.prisma.partnerNewCapital.update({
                    where: { id: p.id },
                    data: {
                        remaining: {
                            decrement: Number(usedAmount),
                        },
                    },
                });
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
        const firstRepaymentDate = dto.repaymentDay
            ? new Date(dto.repaymentDay)
            : (() => {
                throw new common_1.BadRequestException('يجب تحديد تاريخ أول قسط');
            })();
        let remainingPrincipal = principal;
        let remainingInterest = totalInterest;
        for (let i = 0; i < months; i++) {
            const dueDate = new Date(firstRepaymentDate);
            if (dto.type === client_1.LoanType.DAILY) {
                dueDate.setDate(firstRepaymentDate.getDate() + i);
            }
            else if (dto.type === client_1.LoanType.WEEKLY) {
                dueDate.setDate(firstRepaymentDate.getDate() + i * 7);
            }
            else {
                dueDate.setMonth(firstRepaymentDate.getMonth() + i);
            }
            let amount = paymentAmount;
            if (i === months - 1 && lastPayment.gt(0)) {
                amount = paymentAmount.plus(lastPayment);
            }
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
                count: i + 1,
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
                LoanNewCapitalShare: { select: { partnerId: true, amountUsed: true, percent: true } },
            },
        });
        return { message: 'تم انشاء السلفة بنجاح', loan: loanWithIncludes };
    }
    async activateLoan(id, userId) {
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: {
                repayments: true,
                client: { select: { id: true } },
                LoanPartnerShare: { include: { partner: true } },
                LoanNewCapitalShare: true,
            },
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.status !== client_1.LoanStatus.PENDING)
            throw new common_1.BadRequestException('فقط السلف المعلقة يمكن تفعيلها');
        const user = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!loan.repayments || loan.repayments.length === 0) {
            const principal = new library_1.Decimal(loan.amount);
            const totalInterest = new library_1.Decimal(loan.interestAmount);
            const totalAmount = new library_1.Decimal(loan.totalAmount);
            const paymentAmount = new library_1.Decimal(loan.paymentAmount);
            const fullMonths = totalAmount.div(paymentAmount).floor().toNumber();
            const lastPayment = totalAmount.minus(paymentAmount.mul(fullMonths));
            let months = fullMonths;
            const hasRemainder = lastPayment.gt(0);
            const repayments = [];
            const firstRepaymentDate = loan.repaymentDay || new Date();
            let remainingPrincipal = principal;
            let remainingInterest = totalInterest;
            for (let i = 0; i < months; i++) {
                const dueDate = new Date(firstRepaymentDate);
                if (loan.type === client_1.LoanType.DAILY) {
                    dueDate.setDate(firstRepaymentDate.getDate() + i);
                }
                else if (loan.type === client_1.LoanType.WEEKLY) {
                    dueDate.setDate(firstRepaymentDate.getDate() + i * 7);
                }
                else {
                    dueDate.setMonth(firstRepaymentDate.getMonth() + i);
                }
                let amount = paymentAmount;
                if (i === months - 1 && hasRemainder) {
                    amount = paymentAmount.plus(lastPayment);
                }
                let principalAmount;
                let interestAmount;
                if (i === months && hasRemainder) {
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
                    count: i + 1,
                    loanId: loan.id,
                    clientId: loan.clientId,
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
        const receivable = await this.prisma.account.findFirst({
            where: { accountBasicType: 'LOANS_RECEIVABLE' },
        });
        let creditAccount;
        if (loan.source === client_1.LoanFundSource.GENERAL) {
            creditAccount = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'BANK' },
            });
        }
        else if (loan.source === client_1.LoanFundSource.NEW_CAPITAL) {
            creditAccount = await this.prisma.account.findFirstOrThrow({
                where: { accountBasicType: 'NEW_CAPITAL_BANK' },
            });
        }
        if (!receivable)
            throw new common_1.BadRequestException('Loan receivable account must exist');
        const { journal } = await this.journalService.createJournal({
            reference: `LN - ${loan.id}`,
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
                    accountId: creditAccount.id,
                    debit: 0,
                    credit: loan.amount,
                    description: 'سلفة عميل',
                },
            ],
        }, userId);
        await this.journalService.postJournal(journal.id, userId);
        const clientjournal = await this.journalService.createJournal({
            reference: `int - ${loan.id}`,
            description: `تحويل فوائد سلفة للعميل ${loan.clientId} إلى حسابه`,
            type: 'GENERAL',
            sourceType: 'LOAN_INTEREST',
            sourceId: loan.id,
            lines: [
                { accountId: receivable.id, debit: loan.interestAmount, credit: 0, clientId: loan.clientId },
                { accountId: receivable.id, debit: 0, credit: loan.interestAmount },
            ],
        }, userId);
        await this.journalService.postJournal(clientjournal.journal.id, userId);
        await this.prisma.loan.update({
            where: { id },
            data: {
                status: client_1.LoanStatus.ACTIVE,
                disbursementJournalId: journal.id,
            },
        });
        await this.createPartnerAccrualsOnActivation(id);
        await this.prisma.$transaction(async (tx) => {
            await this.handleNewCapitalOnActivation(tx, loan, userId);
        });
        await this.updateClientStatus(loan.clientId);
        await this.prisma.auditLog.create({
            data: {
                userId,
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
            const interestJournal = await tx.journalHeader.findFirst({
                where: {
                    sourceType: 'LOAN_INTEREST',
                    sourceId: loan.id,
                },
                select: { id: true },
            });
            const allJournalIds = [...loanJournalIds, ...repaymentJournalIds, ...interestJournal ? [interestJournal.id] : []];
            if (allJournalIds.length > 0) {
                for (const journalId of allJournalIds) {
                    try {
                        await this.journalService.unpostJournal(currentUser, journalId);
                    }
                    catch (e) {
                        console.warn(`⚠️ Skipped unposting journal ${journalId}: `, e.message);
                    }
                }
                await tx.journalLine.deleteMany({
                    where: { journalId: { in: allJournalIds } },
                });
                await tx.journalHeader.deleteMany({
                    where: { id: { in: allJournalIds } },
                });
            }
            await tx.repayment.deleteMany({ where: { loanId: id } });
            await tx.loan.update({
                where: { id },
                data: {
                    status: client_1.LoanStatus.PENDING,
                    disbursementJournalId: null,
                    settlementJournalId: null,
                },
            });
            await this.updateClientStatus(loan.clientId);
            await this.handleNewCapitalOnDeactivation(tx, id);
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
        if (filters?.clientName) {
            where.client = { name: { contains: filters.clientName, mode: 'insensitive' } };
        }
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
                kafeel: { select: { id: true, name: true } },
                fromclient: { select: { id: true, name: true } }
            },
            skip: (page - 1) * limit,
            take: limit,
            orderBy: { id: 'desc' },
        });
        const loans = await Promise.all(unformattedLoans.map(async (loan) => {
            const createdAt = loan.createdAt ? new Date(loan.createdAt) : null;
            const startDate = loan.startDate ? new Date(loan.startDate) : null;
            const endDate = loan.endDate ? new Date(loan.endDate) : null;
            const repaymentDay = loan.repaymentDay ? new Date(loan.repaymentDay) : null;
            const allRepaymentsAggregation = await this.prisma.repayment.aggregate({
                where: { loanId: loan.id },
                _sum: {
                    paidAmount: true,
                    remaining: true,
                },
            });
            const totalPaidAmount = Number(allRepaymentsAggregation._sum.paidAmount || 0);
            const totalRemainingAmount = Number(allRepaymentsAggregation._sum.remaining || 0);
            const remainingBalance = Math.max(0, totalRemainingAmount);
            const paymentProofs = await this.prisma.repayment.findMany({
                where: { loanId: loan.id, PaymentProof: { not: null } },
                select: { PaymentProof: true },
                orderBy: { createdAt: 'desc' },
            });
            const PAYMENT_PROOF = [
                ...new Set(paymentProofs.map(p => p.PaymentProof).filter(Boolean))
            ];
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
                repaymentDay: repaymentDay
                    ? luxon_1.DateTime.fromJSDate(repaymentDay).setZone('Asia/Riyadh').toFormat('yyyy-LL-dd')
                    : null,
                createdAtHijri: createdAt ? this.toHijri(createdAt) : null,
                startDateHijri: startDate ? this.toHijri(startDate) : null,
                endDateHijri: endDate ? this.toHijri(endDate) : null,
                repaymentDayHijri: repaymentDay ? this.toHijri(repaymentDay) : null,
                remainingBalance: remainingBalance,
                totalPaidAmount: totalPaidAmount,
                totalRemainingAmount: totalRemainingAmount,
                PAYMENT_PROOF,
            };
        }));
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
                LoanNewCapitalShare: { select: { partnerId: true, amountUsed: true, percent: true } },
                fromclient: { select: { id: true, name: true } }
            },
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        const totalRepayments = await this.prisma.repayment.count({
            where: { loanId: id },
        });
        const paidRepayments = await this.prisma.repayment.count({
            where: {
                loanId: id,
                status: { in: ['PAID', 'EARLY_PAID'] }
            },
        });
        const allRepaymentsAggregation = await this.prisma.repayment.aggregate({
            where: { loanId: id },
            _sum: {
                paidAmount: true,
                remaining: true,
            },
        });
        const totalPaidAmount = Number(allRepaymentsAggregation._sum.paidAmount || 0);
        const totalRemainingAmount = Number(allRepaymentsAggregation._sum.remaining || 0);
        const Repayments = await this.prisma.repayment.findMany({
            where: { loanId: id },
            orderBy: { dueDate: 'asc' },
            skip: (page - 1) * limit,
            take: limit,
            select: {
                id: true,
                count: true,
                loanId: true,
                clientId: true,
                dueDate: true,
                amount: true,
                remaining: true,
                paidAmount: true,
                principalAmount: true,
                interestAmount: true,
                status: true,
                paymentDate: true,
                attachments: true,
                PaymentProof: true,
                reviewStatus: true,
                notes: true,
                postponeApproved: true,
                postponeReason: true,
                newDueDate: true,
                createdAt: true,
            },
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
        const loanPartnerNewShareName = await Promise.all(loan.LoanNewCapitalShare.map(async (share) => {
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
                paidRepayments: paidRepayments,
                totalPaidAmount: totalPaidAmount,
                totalRemainingAmount: totalRemainingAmount,
            },
            repayments: formattedRepayments,
            loanPartnerShare: loanPartnerShareName,
            loanNewCapitalShare: loanPartnerNewShareName,
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
        const loan = await this.prisma.loan.findUnique({
            where: { id },
            include: { LoanPartnerShare: true, LoanNewCapitalShare: true },
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.status !== client_1.LoanStatus.PENDING)
            throw new common_1.BadRequestException('فقط السلف المعلقة يمكن تعديلها');
        const user = await this.prisma.user.findUnique({
            where: { id: currentUser },
        });
        const loanUpdateData = {};
        if (dto.amount !== undefined)
            loanUpdateData.amount = dto.amount;
        if (dto.paymentAmount !== undefined)
            loanUpdateData.paymentAmount = dto.paymentAmount;
        if (dto.type !== undefined)
            loanUpdateData.type = dto.type;
        if (dto.startDate !== undefined)
            loanUpdateData.startDate = new Date(dto.startDate);
        if (dto.promissionaryDate !== undefined)
            loanUpdateData.promissionaryDate = new Date(dto.promissionaryDate);
        if (dto.repaymentDay !== undefined) {
            loanUpdateData.repaymentDay = new Date(dto.repaymentDay);
        }
        if (dto.bankAccountId !== undefined)
            loanUpdateData.bankAccountId = dto.bankAccountId;
        if (dto.partnerId !== undefined)
            loanUpdateData.partnerId = dto.partnerId;
        if (dto.clientId !== undefined)
            loanUpdateData.clientId = dto.clientId;
        if (dto.kafeelId !== undefined)
            loanUpdateData.kafeelId = dto.kafeelId;
        if (dto.issuanceCity !== undefined)
            loanUpdateData.issuanceCity = dto.issuanceCity;
        if (dto.paymentCity !== undefined)
            loanUpdateData.paymentCity = dto.paymentCity;
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
        const sourceChanged = dto.source !== undefined &&
            dto.source !== loan.source;
        if (sourceChanged && loan.source === client_1.LoanFundSource.GENERAL && dto.source === client_1.LoanFundSource.NEW_CAPITAL) {
            await this.prisma.loanPartnerShare.deleteMany({
                where: { loanId: loan.id },
            });
            const newCapitalPartners = await this.prisma.partnerNewCapital.findMany({
                where: { remaining: { gt: 0 } },
            });
            if (newCapitalPartners.length === 0) {
                throw new common_1.BadRequestException('لا يوجد رأس مال جديد متاح');
            }
            const principal = new library_1.Decimal(dto.amount ? dto.amount : loan.amount);
            const totalNewCapital = newCapitalPartners.reduce((sum, p) => sum.plus(p.remaining), new library_1.Decimal(0));
            if (totalNewCapital.lt(principal)) {
                throw new common_1.BadRequestException('رأس المال الجديد غير كافٍ');
            }
            for (const p of newCapitalPartners) {
                const ratio = new library_1.Decimal(p.remaining).div(totalNewCapital);
                const usedAmount = principal.mul(ratio).toDecimalPlaces(2);
                await this.prisma.loanNewCapitalShare.create({
                    data: {
                        loanId: loan.id,
                        partnerId: p.partnerId,
                        amountUsed: Number(usedAmount),
                        percent: Number(ratio.mul(100).toFixed(2)),
                    },
                });
                await this.prisma.partnerNewCapital.update({
                    where: { id: p.id },
                    data: {
                        remaining: { decrement: Number(usedAmount) },
                    },
                });
            }
        }
        if (sourceChanged && loan.source === client_1.LoanFundSource.NEW_CAPITAL && dto.source === client_1.LoanFundSource.GENERAL) {
            const shares = await this.prisma.loanNewCapitalShare.findMany({
                where: { loanId: loan.id },
            });
            for (const s of shares) {
                await this.prisma.partnerNewCapital.updateMany({
                    where: { partnerId: s.partnerId },
                    data: {
                        remaining: { increment: s.amountUsed },
                    },
                });
            }
            await this.prisma.loanNewCapitalShare.deleteMany({
                where: { loanId: loan.id },
            });
            const partners = await this.prisma.partner.findMany({
                where: { isNewPartner: false },
            });
            const totalCapital = partners.reduce((sum, p) => sum + p.totalAmount, 0);
            for (const p of partners) {
                const percent = totalCapital > 0 ? (p.totalAmount / totalCapital) * 100 : 0;
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
            const financialUpdateData = {
                amount: Number(principal.toFixed(2)),
                interestRate: Number(interestRate.toFixed(2)),
                interestAmount: Number(totalInterest.toFixed(2)),
                totalAmount: Number(totalAmount.toFixed(2)),
                startDate: dto.startDate ? new Date(dto.startDate) : loan.startDate,
            };
            if (dto.kafeelId !== undefined) {
                financialUpdateData.kafeelId = dto.kafeelId;
            }
            await this.prisma.loan.update({
                where: { id },
                data: financialUpdateData,
            });
            const paymentAmount = new library_1.Decimal(dto.paymentAmount || updated.paymentAmount);
            const fullMonths = totalAmount.div(paymentAmount).floor().toNumber();
            const lastPayment = totalAmount.minus(paymentAmount.mul(fullMonths));
            const months = fullMonths;
            const hasRemainder = lastPayment.gt(0);
            let remainingPrincipal = principal;
            let remainingInterest = totalInterest;
            const repayments = [];
            const firstDate = dto.repaymentDay ?
                new Date(dto.repaymentDay) :
                loan.repaymentDay ?
                    new Date(loan.repaymentDay) : new Date();
            for (let i = 1; i <= months; i++) {
                let dueDate;
                if (updated.type === client_1.LoanType.DAILY) {
                    dueDate = new Date(firstDate);
                    dueDate.setUTCDate(firstDate.getUTCDate() + (i - 1));
                }
                else if (updated.type === client_1.LoanType.WEEKLY) {
                    dueDate = new Date(firstDate);
                    dueDate.setUTCDate(firstDate.getUTCDate() + (i - 1) * 7);
                }
                else {
                    dueDate = new Date(Date.UTC(firstDate.getUTCFullYear(), firstDate.getUTCMonth() + (i - 1), firstDate.getUTCDate(), 0, 0, 0, 0));
                }
                let amount = paymentAmount;
                if (i === months && hasRemainder) {
                    amount = paymentAmount.plus(lastPayment);
                }
                let principalAmount;
                let interestAmount;
                if (i === months && hasRemainder) {
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
        if (dto.amount &&
            dto.amount !== loan.amount &&
            loan.source === client_1.LoanFundSource.NEW_CAPITAL) {
            const shares = await this.prisma.loanNewCapitalShare.findMany({
                where: { loanId: loan.id },
            });
            for (const s of shares) {
                await this.prisma.partnerNewCapital.updateMany({
                    where: { partnerId: s.partnerId },
                    data: {
                        remaining: { increment: s.amountUsed },
                    },
                });
            }
            const principal = new library_1.Decimal(dto.amount);
            const newCapitalPartners = await this.prisma.partnerNewCapital.findMany({
                where: { remaining: { gt: 0 } },
            });
            if (newCapitalPartners.length === 0) {
                throw new common_1.BadRequestException('لا يوجد رأس مال جديد متاح بعد التعديل');
            }
            const totalNewCapital = newCapitalPartners.reduce((sum, p) => sum.plus(p.remaining), new library_1.Decimal(0));
            if (totalNewCapital.lt(principal)) {
                throw new common_1.BadRequestException('رأس المال الجديد غير كافٍ بعد تعديل المبلغ');
            }
            await this.prisma.loanNewCapitalShare.deleteMany({
                where: { loanId: loan.id },
            });
            for (const p of newCapitalPartners) {
                const ratio = new library_1.Decimal(p.remaining).div(totalNewCapital);
                const usedAmount = principal.mul(ratio).toDecimalPlaces(2);
                if (usedAmount.lte(0))
                    continue;
                await this.prisma.loanNewCapitalShare.create({
                    data: {
                        loanId: loan.id,
                        partnerId: p.partnerId,
                        amountUsed: Number(usedAmount),
                        percent: Number(ratio.mul(100).toFixed(2)),
                    },
                });
                await this.prisma.partnerNewCapital.update({
                    where: { id: p.id },
                    data: {
                        remaining: { decrement: Number(usedAmount) },
                    },
                });
                await this.prisma.loan.update({
                    where: { id },
                    data: {
                        DEBT_ACKNOWLEDGMENT: null,
                        PROMISSORY_NOTE: null,
                    },
                });
            }
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
            const headersToDelete = await tx.journalHeader.findMany({
                where: {
                    OR: [
                        {
                            sourceType: client_1.JournalSourceType.LOAN,
                            sourceId: loan.id,
                        },
                        {
                            sourceType: client_1.JournalSourceType.REPAYMENT,
                            sourceId: repaymentIds.length > 0 ? { in: repaymentIds } : undefined,
                        },
                    ],
                },
                select: { id: true },
            });
            if (headersToDelete.length > 0) {
                const headerIds = headersToDelete.map(h => h.id);
                await tx.journalLine.deleteMany({ where: { journalId: { in: headerIds } } });
                await tx.journalHeader.deleteMany({ where: { id: { in: headerIds } } });
            }
            await tx.repayment.deleteMany({ where: { loanId: id } });
            await tx.loanPartnerShare.deleteMany({ where: { loanId: id } });
            const shares = await this.prisma.loanNewCapitalShare.findMany({
                where: { loanId: loan.id },
            });
            for (const s of shares) {
                await this.prisma.partnerNewCapital.updateMany({
                    where: { partnerId: s.partnerId },
                    data: {
                        remaining: { increment: s.amountUsed },
                    },
                });
            }
            await tx.loanNewCapitalShare.deleteMany({ where: { loanId: id } });
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
    async uploadDebtAcknowledgmentFile(currentUser, loanId, file, contractNumbers) {
        console.log('uploadDebtAcknowledgmentFile - contractNumbers:', contractNumbers);
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
        await this.prisma.loan.update({
            where: { id: loanId },
            data: {
                DEBT_ACKNOWLEDGMENT: publicUrl,
                debtAcknowledgmentNumber: contractNumbers?.debtAcknowledgmentNumber
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
    async uploadPromissoryNoteFile(currentUser, loanId, file, contractNumbers) {
        console.log('uploadPromissoryNoteFile - contractNumbers:', contractNumbers);
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
        await this.prisma.loan.update({
            where: { id: loanId },
            data: {
                PROMISSORY_NOTE: publicUrl,
                promissoryNoteNumber: contractNumbers?.promissoryNoteNumber
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
    async saveContractNumbers(currentUser, loanId, contractNumbers) {
        console.log('saveContractNumbers - contractNumbers:', contractNumbers);
        const updateData = {};
        if (contractNumbers.debtAcknowledgmentNumber) {
            updateData.debtAcknowledgmentNumber = contractNumbers.debtAcknowledgmentNumber;
        }
        if (contractNumbers.promissoryNoteNumber) {
            updateData.promissoryNoteNumber = contractNumbers.promissoryNoteNumber;
        }
        if (Object.keys(updateData).length === 0) {
            throw new common_1.BadRequestException('No contract numbers provided');
        }
        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        const updatedLoan = await this.prisma.loan.update({
            where: { id: loanId },
            data: updateData,
        });
        const user = await this.prisma.user.findUnique({ where: { id: currentUser } });
        await this.prisma.auditLog.create({
            data: {
                userId: currentUser,
                screen: 'Loans',
                action: 'UPDATE',
                description: `قام المستخدم ${user?.name} بتحديث أرقام العقود للسلفة رقم ${loan.code}`,
            },
        });
        return { message: 'تم حفظ أرقام العقود بنجاح', loan: updatedLoan };
    }
    async convertLoanClient(clientAId, clientBId, loanId, kafeelId, userId) {
        const clientA = await this.prisma.client.findUnique({ where: { id: clientAId } });
        const clientB = await this.prisma.client.findUnique({ where: { id: clientBId }, include: { kafeelS: true } });
        if (!clientA || !clientB)
            throw new common_1.NotFoundException('Client not found');
        let selectedKafeel = null;
        let newKafeelId = null;
        if (kafeelId) {
            if (!clientB.kafeelS || clientB.kafeelS.length === 0) {
                throw new common_1.BadRequestException('العميل المحول إليه لا يملك كفلاء');
            }
            selectedKafeel = clientB.kafeelS.find(k => k.id === kafeelId);
            if (!selectedKafeel) {
                throw new common_1.BadRequestException('الكفيل المختار لا ينتمي إلى العميل المحول إليه');
            }
            newKafeelId = selectedKafeel.id;
        }
        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: { repayments: true },
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.clientId !== clientAId) {
            throw new common_1.BadRequestException('السلف لا تنتمي للعميل المصدر');
        }
        const remainingReps = loan.repayments.filter(r => r.remaining > 0);
        if (remainingReps.length === 0) {
            throw new common_1.BadRequestException('لا يوجد مبالغ متبقية لتحويلها');
        }
        const totalTransferredAmount = remainingReps.reduce((sum, r) => sum + r.remaining, 0);
        await this.prisma.$transaction(async (tx) => {
            await tx.loan.update({
                where: { id: loanId },
                data: {
                    clientId: clientBId,
                    kafeelId: newKafeelId,
                },
            });
            for (const rep of remainingReps) {
                await tx.repayment.update({
                    where: { id: rep.id },
                    data: { clientId: clientBId },
                });
            }
            const receivableAccount = await tx.account.findFirst({
                where: { accountBasicType: 'LOANS_RECEIVABLE' },
            });
            if (!receivableAccount)
                throw new common_1.NotFoundException('Loans receivable account not found');
            const { journal } = await this.journalService.createJournal({
                reference: `CONV - ${Date.now()}`,
                description: `تحويل رصيد السلفة رقم ${loanId} من العميل ${clientAId} إلى العميل ${clientBId}`,
                type: 'GENERAL',
                sourceType: 'LOAN_CONVERSION',
                sourceId: loanId,
                lines: [
                    { accountId: receivableAccount.id, debit: totalTransferredAmount, credit: 0, clientId: clientBId },
                    { accountId: receivableAccount.id, debit: 0, credit: totalTransferredAmount, clientId: clientAId },
                ],
            }, userId);
            await this.journalService.postJournal(journal.id, userId);
            await tx.auditLog.create({
                data: {
                    userId,
                    screen: 'Clients',
                    action: 'UPDATE',
                    description: `قام المستخدم بتحويل السلفة رقم ${loanId} من العميل ${clientAId} إلى العميل ${clientBId}`,
                },
            });
        });
        await this.updateClientStatus(clientAId);
        await this.updateClientStatus(clientBId);
        return {
            message: 'تم تحويل السلفة بنجاح',
            totalTransferredAmount,
        };
    }
    async transferPartialLoanAmount(fromClientId, toClientId, loanId, amountToTransfer, kafeelId, userId) {
        if (amountToTransfer <= 0) {
            throw new common_1.BadRequestException('مبلغ التحويل يجب أن يكون أكبر من صفر');
        }
        const fromClient = await this.prisma.client.findUnique({ where: { id: fromClientId } });
        const toClient = await this.prisma.client.findUnique({
            where: { id: toClientId },
            include: { kafeelS: true },
        });
        if (!fromClient || !toClient) {
            throw new common_1.NotFoundException('Client not found');
        }
        if (kafeelId) {
            const valid = toClient.kafeelS.some(k => k.id === kafeelId);
            if (!valid) {
                throw new common_1.BadRequestException('الكفيل المختار لا ينتمي إلى العميل المحول إليه');
            }
        }
        const round2 = (n) => Math.round(n * 100) / 100;
        const loan = await this.prisma.loan.findUnique({
            where: { id: loanId },
            include: {
                repayments: {
                    where: { remaining: { gt: 0 } },
                    orderBy: { dueDate: 'asc' },
                },
            },
        });
        if (!loan)
            throw new common_1.NotFoundException('Loan not found');
        if (loan.clientId !== fromClientId) {
            throw new common_1.BadRequestException('السلفة لا تنتمي للعميل المصدر');
        }
        const totalRemaining = loan.repayments.reduce((s, r) => s + r.remaining, 0);
        if (amountToTransfer > totalRemaining) {
            throw new common_1.BadRequestException('المبلغ المطلوب أكبر من المتبقي على السلفة');
        }
        let remainingToTransfer = amountToTransfer;
        const splits = [];
        for (const r of loan.repayments) {
            if (remainingToTransfer <= 0)
                break;
            const taken = Math.min(r.remaining, remainingToTransfer);
            splits.push({
                repaymentId: r.id,
                amount: taken,
                dueDate: r.dueDate,
            });
            remainingToTransfer -= taken;
        }
        if (!splits.length) {
            throw new common_1.BadRequestException('لا يوجد أقساط صالحة للتحويل');
        }
        const result = await this.prisma.$transaction(async (tx) => {
            let actualPrincipal = 0;
            let actualInterest = 0;
            const takenMap = new Map();
            for (const split of splits) {
                const rep = await tx.repayment.findUnique({ where: { id: split.repaymentId } });
                if (!rep)
                    continue;
                const originalRemaining = rep.remaining;
                const originalPrincipal = rep.principalAmount;
                const originalInterest = rep.interestAmount;
                const ratio = split.amount / originalRemaining;
                const principalTaken = round2(originalPrincipal * ratio);
                const interestTaken = round2(originalInterest * ratio);
                actualPrincipal += principalTaken;
                actualInterest += interestTaken;
                takenMap.set(rep.id, {
                    principal: principalTaken,
                    interest: interestTaken,
                });
                await tx.repayment.update({
                    where: { id: rep.id },
                    data: {
                        remaining: round2(originalRemaining - split.amount),
                        principalAmount: round2(originalPrincipal - principalTaken),
                        interestAmount: round2(originalInterest - interestTaken),
                        status: split.amount === originalRemaining
                            ? 'PAID'
                            : 'PENDING',
                    },
                });
            }
            actualPrincipal = round2(actualPrincipal);
            actualInterest = round2(actualInterest);
            const totalTransferred = round2(actualPrincipal + actualInterest);
            const newLoan = await tx.loan.create({
                data: {
                    code: `SPLIT-${loan.code}-${Date.now()}`,
                    clientId: toClientId,
                    kafeelId,
                    amount: actualPrincipal,
                    interestRate: loan.interestRate,
                    interestAmount: actualInterest,
                    totalAmount: totalTransferred,
                    paymentAmount: loan.paymentAmount,
                    durationMonths: loan.durationMonths,
                    type: loan.type,
                    source: loan.source,
                    status: 'ACTIVE',
                    startDate: new Date(),
                    repaymentDay: splits[0].dueDate,
                    issuanceCity: loan.issuanceCity,
                    paymentCity: loan.paymentCity,
                    partnerId: loan.partnerId,
                    bankAccountId: loan.bankAccountId,
                    fromClientId: fromClientId,
                },
            });
            let count = 1;
            for (const split of splits) {
                const taken = takenMap.get(split.repaymentId);
                if (!taken)
                    continue;
                await tx.repayment.create({
                    data: {
                        loanId: newLoan.id,
                        clientId: toClientId,
                        count: count++,
                        dueDate: split.dueDate,
                        amount: round2(taken.principal + taken.interest),
                        remaining: round2(taken.principal + taken.interest),
                        paidAmount: 0,
                        principalAmount: taken.principal,
                        interestAmount: taken.interest,
                        status: 'PENDING',
                    },
                });
            }
            await tx.loan.update({
                where: { id: loanId },
                data: {
                    amount: { decrement: actualPrincipal },
                    interestAmount: { decrement: actualInterest },
                    totalAmount: { decrement: totalTransferred },
                },
            });
            const receivable = await tx.account.findFirst({
                where: { accountBasicType: 'LOANS_RECEIVABLE' },
            });
            if (!receivable)
                throw new common_1.NotFoundException('Loans receivable account not found');
            const { journal } = await this.journalService.createJournal({
                reference: `LOAN-SPLIT-${Date.now()}`,
                description: `تحويل جزئي من السلفة ${loanId}`,
                type: 'GENERAL',
                sourceType: 'LOAN_CONVERSION',
                sourceId: loanId,
                lines: [
                    { accountId: receivable.id, debit: totalTransferred, credit: 0, clientId: toClientId },
                    { accountId: receivable.id, debit: 0, credit: totalTransferred, clientId: fromClientId },
                ],
            }, userId);
            await this.journalService.postJournal(journal.id, userId);
            return { newLoanId: newLoan.id };
        });
        await this.updateClientStatus(fromClientId);
        await this.updateClientStatus(toClientId);
        return {
            message: 'تم تحويل جزء من السلفة بنجاح',
            transferredAmount: amountToTransfer,
            newLoanId: result.newLoanId,
        };
    }
};
exports.LoansService = LoansService;
exports.LoansService = LoansService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        journal_service_1.JournalService])
], LoansService);
//# sourceMappingURL=loans.service.js.map